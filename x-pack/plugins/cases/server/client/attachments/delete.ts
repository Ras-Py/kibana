/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import pMap from 'p-map';

import type { SavedObject } from '@kbn/core/server';
import type { CommentAttributes } from '../../../common/api';
import { Actions, ActionTypes } from '../../../common/api';
import { getAlertInfoFromComments, isCommentRequestTypeAlert } from '../../common/utils';
import { CASE_SAVED_OBJECT, MAX_CONCURRENT_SEARCHES } from '../../../common/constants';
import type { CasesClientArgs } from '../types';
import { createCaseError } from '../../common/error';
import { Operations } from '../../authorization';
import type { DeleteAllArgs, DeleteArgs } from './types';

/**
 * Delete all comments for a case.
 *
 * @ignore
 */
export async function deleteAll(
  { caseID }: DeleteAllArgs,
  clientArgs: CasesClientArgs
): Promise<void> {
  const {
    user,
    services: { caseService, attachmentService, userActionService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const comments = await caseService.getAllCaseComments({
      id: caseID,
    });

    if (comments.total <= 0) {
      throw Boom.notFound(`No comments found for ${caseID}.`);
    }

    await authorization.ensureAuthorized({
      operation: Operations.deleteAllComments,
      entities: comments.saved_objects.map((comment) => ({
        owner: comment.attributes.owner,
        id: comment.id,
      })),
    });

    const mapper = async (comment: SavedObject<CommentAttributes>) =>
      attachmentService.delete({
        attachmentId: comment.id,
        refresh: false,
      });

    // Ensuring we don't too many concurrent deletions running.
    await pMap(comments.saved_objects, mapper, {
      concurrency: MAX_CONCURRENT_SEARCHES,
    });

    await userActionService.creator.bulkCreateAttachmentDeletion({
      caseId: caseID,
      attachments: comments.saved_objects.map((comment) => ({
        id: comment.id,
        owner: comment.attributes.owner,
        attachment: comment.attributes,
      })),
      user,
    });
  } catch (error) {
    throw createCaseError({
      message: `Failed to delete all comments case id: ${caseID}: ${error}`,
      error,
      logger,
    });
  }
}

/**
 * Deletes an attachment
 *
 * @ignore
 */
export async function deleteComment(
  { caseID, attachmentID }: DeleteArgs,
  clientArgs: CasesClientArgs
) {
  const {
    user,
    services: { attachmentService, userActionService, alertsService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const attachment = await attachmentService.getter.get({
      attachmentId: attachmentID,
    });

    if (attachment == null) {
      throw Boom.notFound(`This comment ${attachmentID} does not exist anymore.`);
    }

    await authorization.ensureAuthorized({
      entities: [{ owner: attachment.attributes.owner, id: attachment.id }],
      operation: Operations.deleteComment,
    });

    const type = CASE_SAVED_OBJECT;
    const id = caseID;

    const caseRef = attachment.references.find((c) => c.type === type);
    if (caseRef == null || (caseRef != null && caseRef.id !== id)) {
      throw Boom.notFound(`This comment ${attachmentID} does not exist in ${id}.`);
    }

    await attachmentService.delete({
      attachmentId: attachmentID,
      refresh: false,
    });

    await userActionService.creator.createUserAction({
      type: ActionTypes.comment,
      action: Actions.delete,
      caseId: id,
      attachmentId: attachmentID,
      payload: { attachment: { ...attachment.attributes } },
      user,
      owner: attachment.attributes.owner,
    });

    await handleAlerts({ alertsService, attachment: attachment.attributes, caseId: id });
  } catch (error) {
    throw createCaseError({
      message: `Failed to delete comment: ${caseID} comment id: ${attachmentID}: ${error}`,
      error,
      logger,
    });
  }
}

interface HandleAlertsArgs {
  alertsService: CasesClientArgs['services']['alertsService'];
  attachment: CommentAttributes;
  caseId: string;
}

const handleAlerts = async ({ alertsService, attachment, caseId }: HandleAlertsArgs) => {
  if (!isCommentRequestTypeAlert(attachment)) {
    return;
  }

  const alerts = getAlertInfoFromComments([attachment]);
  await alertsService.ensureAlertsAuthorized({ alerts });
  await alertsService.removeCaseIdFromAlerts({ alerts, caseId });
};
