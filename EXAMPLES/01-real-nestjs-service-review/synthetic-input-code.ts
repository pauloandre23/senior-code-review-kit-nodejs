import { Injectable, Logger } from '@nestjs/common'
import { Recipient, ChannelMessage, TemplateLine } from '../../types'
import {
  fetchTemplateLines,
  generateMessagesForChannel,
  PROCESSING_STATUS,
} from 'apps/notification-dispatch-service/src/utils'
import { TemplateRenderResponse } from 'commons/template-render-service/types'
import { NotificationCacheService } from './notification-cache.service'
import { BatchRecipientProcessorService } from './batch-recipient-processor.service'
import { ExternalServicesService } from '../external/external-services.service'

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name)

  constructor(
    private readonly cacheService: NotificationCacheService,
    private readonly batchProcessorService: BatchRecipientProcessorService,
    private readonly externalServicesService: ExternalServicesService,
  ) {}

  async handleNotificationProcessing(
    notificationId: string,
    tenantCode: string,
    countryCode: string,
    languageCode: string,
  ): Promise<{
    notificationId: string
    messages: ChannelMessage[] | []
    renderInfo: TemplateRenderResponse | null
  }> {
    try {
      let processingStatus = await this.cacheService.getProcessingStatus(
        notificationId,
      )

      if (processingStatus === PROCESSING_STATUS.STARTED) {
        processingStatus = await this.waitForProcessingCompletion(notificationId)
      }

      if (processingStatus === PROCESSING_STATUS.COMPLETED) {
        return await this.handleCompletedNotification(notificationId)
      }

      if (processingStatus === PROCESSING_STATUS.DELETE_NOTIFICATION) {
        return {
          notificationId,
          messages: [],
          renderInfo: null,
        }
      }

      return await this.handleNotification(
        notificationId,
        tenantCode,
        languageCode,
        countryCode,
      )
    } catch (error) {
      this.logger.error(`Failed to process notification ${notificationId}:`, error)
      return Promise.reject(new Error('Failed to process notification'))
    }
  }

  private async waitForProcessingCompletion(
    notificationId: string,
  ): Promise<string | null> {
    const maxWaitMs = 5000
    const pollIntervalMs = 5
    const start = Date.now()

    let processingStatus = await this.cacheService.getProcessingStatus(
      notificationId,
    )

    while (
      processingStatus === PROCESSING_STATUS.STARTED &&
      Date.now() - start < maxWaitMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      processingStatus = await this.cacheService.getProcessingStatus(notificationId)
    }

    return processingStatus
  }

  private async handleCompletedNotification(notificationId: string): Promise<{
    notificationId: string
    messages: ChannelMessage[] | []
    renderInfo: TemplateRenderResponse | null
  }> {
    this.logger.log(`Notification ${notificationId} has already been processed.`)

    const messages = await this.cacheService.getMessages(notificationId)
    const renderInfo = await this.cacheService.getRenderInfo(notificationId)

    if (messages.every((msg) => msg.channelType === 'INTERNAL_NOTE')) {
      this.logger.log(
        `Messages for notification ${notificationId} contain only internal notes. Reprocessing.`,
      )
      return {
        notificationId,
        messages: messages,
        renderInfo,
      }
    }

    if (!messages.length || !renderInfo) {
      this.logger.error(`Data missing for completed notification ${notificationId}.`)
      return await this.handleNotification(notificationId, '', '', '')
    }

    return {
      notificationId,
      messages,
      renderInfo,
    }
  }

  async handleNotification(
    notificationId: string,
    tenantCode: string,
    languageCode: string,
    countryCode: string,
  ): Promise<{
    notificationId: string
    messages: ChannelMessage[]
    renderInfo: TemplateRenderResponse | null
  }> {
    try {
      this.logger.log(`Starting processing of notification: ${notificationId}`)
      await this.cacheService.setProcessingStatus(
        notificationId,
        PROCESSING_STATUS.STARTED,
      )

      await this.processBatchRecipients(notificationId, tenantCode, languageCode)

      const recipients = await this.cacheService.getRecipients(notificationId)
      if (recipients.length === 0) {
        this.logger.warn(`No recipients to process for notification: ${notificationId}`)
        throw new Error(`No recipients found for notification: ${notificationId}`)
      }

      const renderInfo = await this.fetchTemplateInfo(
        notificationId,
        tenantCode,
        countryCode,
        recipients,
      )

      const messages = await this.finalizeNotification(
        notificationId,
        recipients,
        renderInfo,
      )

      return {
        notificationId,
        messages,
        renderInfo,
      }
    } catch (error) {
      await this.cacheService.markNotificationFailed(notificationId)
      this.logger.error(
        `Background processing failed for notification ${notificationId}:`,
        error,
      )
      const messages = await this.cacheService.getMessages(notificationId)
      return Promise.resolve({
        notificationId,
        messages: messages,
        renderInfo: null,
      })
    }
  }

  private async processBatchRecipients(
    notificationId: string,
    tenantCode: string,
    languageCode: string,
  ): Promise<void> {
    const batchTasks = await this.cacheService.getBatchTasks(notificationId)

    if (batchTasks.length === 0) {
      return
    }

    const allBatchTasks =
      this.batchProcessorService.flattenBatchTasks(batchTasks)

    const uniqueRecipientIds =
      this.batchProcessorService.getUniqueUnprocessedRecipientIds(allBatchTasks)

    if (uniqueRecipientIds.length === 0) {
      return
    }

    const recipientInfo = await this.externalServicesService
      .fetchRecipientInfo(uniqueRecipientIds, tenantCode, languageCode)
      .catch(() => {
        throw new Error(`Failed to fetch recipient information`)
      })

    let nextSequenceNumber = await this.cacheService.getNextSequenceNumber(notificationId)
    const { tasks: batchTasksUpdated, nextSequenceNumber: updatedSeq } =
      this.batchProcessorService.processSubscriptionTasks(
        batchTasks,
        recipientInfo,
        nextSequenceNumber,
      )
    nextSequenceNumber = updatedSeq
    await this.cacheService.setNextSequenceNumber(notificationId, nextSequenceNumber)

    const allBatchTasksUpdated =
      this.batchProcessorService.flattenUnprocessedBatchTasks(batchTasksUpdated)

    const uniqueChannelKeys =
      this.batchProcessorService.getUniqueUnprocessedChannelKeys(
        allBatchTasksUpdated,
      )

    const recipientChannelInfo = await this.externalServicesService
      .fetchChannelInfo(uniqueChannelKeys, tenantCode)
      .catch(() => {
        throw new Error(`Failed to fetch channel information`)
      })

    const currentRecipientInfo = await this.cacheService.getRecipientInfo(
      notificationId,
    )
    const currentChannelInfo = await this.cacheService.getChannelInfo(
      notificationId,
    )
    const nextRecipientInfo = [...recipientInfo, ...currentRecipientInfo]
    const nextChannelInfo = [
      ...recipientChannelInfo,
      ...currentChannelInfo,
    ]

    await this.cacheService.cacheRecipientInfo(
      notificationId,
      nextRecipientInfo,
    )
    await this.cacheService.cacheChannelInfo(notificationId, nextChannelInfo)

    const recipients: Recipient[] = allBatchTasksUpdated
      .map((task) =>
        this.batchProcessorService.mapBatchTaskToRecipient(
          task,
          nextRecipientInfo,
          nextChannelInfo,
        ),
      )
      .filter((r) => r !== undefined) as Recipient[]

    await this.cacheService.cacheRecipients(notificationId, recipients)
    await this.cacheService.deleteBatchTasks(notificationId)
  }

  private async fetchTemplateInfo(
    notificationId: string,
    tenantCode: string,
    countryCode: string,
    recipients: Recipient[],
  ): Promise<TemplateRenderResponse> {
    try {
      const segmentData = await this.cacheService.getAddedSegments(
        notificationId,
      )
      const segments = segmentData?.groups
      const deliveryWindows =
        await this.cacheService.getDeliveryWindows(notificationId)
      const optInPreferences = await this.cacheService.getOptInPreferences(
        notificationId,
      )
      const targetRegion = await this.cacheService.getTargetRegion(notificationId)
      const currentMessages = await this.cacheService.getMessages(notificationId)
      const sequenceIdsRemoved = await this.cacheService.getSequenceIdsRemoved(
        notificationId,
      )
      const cutCopyGroupMessages =
        await this.cacheService.getCutCopyGroupMessages(notificationId)
      const deletedSegmentMessages =
        await this.cacheService.getDeletedSegmentMessages(notificationId)
      const ungroupedSegmentMessages =
        await this.cacheService.getUngroupedSegmentMessages(notificationId)
      const validMessages = currentMessages.filter(
        (msg) =>
          !deletedSegmentMessages.some(
            (delMsg) => delMsg.sequenceId === msg.sequenceId,
          ) &&
          !ungroupedSegmentMessages.some(
            (ungMsg) => ungMsg.sequenceId === msg.sequenceId,
          ),
      )

      const renderInfo = await this.externalServicesService.fetchTemplateInfo(
        tenantCode,
        countryCode,
        recipients,
        segments,
        deliveryWindows,
        optInPreferences,
        targetRegion,
        validMessages,
        sequenceIdsRemoved,
        cutCopyGroupMessages,
      )

      await this.cacheService.cacheRenderInfo(notificationId, renderInfo)
      return renderInfo
    } catch (error) {
      await this.cacheService.markNotificationFailed(notificationId)
      throw error
    }
  }

  private async finalizeNotification(
    notificationId: string,
    recipients: Recipient[],
    renderInfo: TemplateRenderResponse,
  ): Promise<ChannelMessage[]> {
    const templateLines: TemplateLine[] = fetchTemplateLines(recipients, renderInfo)

    const newlyAddedSegments = await this.cacheService.getAddedSegments(
      notificationId,
    )
    const cutCopyGroupMessages =
      await this.cacheService.getCutCopyGroupMessages(notificationId)
    const currentMessages = await this.cacheService.getMessages(notificationId)
    const newlyAddedMessages = await this.cacheService.getNewlyAddedMessages(
      notificationId,
    )
    const sequenceIdIndex = await this.cacheService.getSequenceIdIndex(notificationId)
    const sequenceIdsRemoved = await this.cacheService.getSequenceIdsRemoved(notificationId)
    const action = await this.cacheService.getAction(notificationId)
    const sequenceIdsQtyUpdated = await this.cacheService.getSequenceIdsQtyUpdated(
      notificationId,
    )
    const ungroupedSegmentMessages =
      await this.cacheService.getUngroupedSegmentMessages(notificationId)

    const messages = generateMessagesForChannel(
      templateLines,
      newlyAddedSegments,
      recipients,
      renderInfo,
      currentMessages,
      newlyAddedMessages,
      sequenceIdIndex,
      sequenceIdsRemoved,
      sequenceIdsQtyUpdated,
      action,
      cutCopyGroupMessages,
      ungroupedSegmentMessages,
    )

    await this.cacheService.clearNotificationContext(
      notificationId,
      action ?? undefined,
    )
    await this.cacheService.cacheTemplateLines(notificationId, templateLines)
    await this.cacheService.cacheMessages(notificationId, messages)
    await this.cacheService.markNotificationCompleted(notificationId)

    return messages
  }

  async getProcessingStatus(notificationId: string): Promise<string | null> {
    return await this.cacheService.getProcessingStatus(notificationId)
  }
}
