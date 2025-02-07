/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Switch } from 'react-router-dom';

import { Route } from '@kbn/shared-ux-router';

import { isVersionMismatch } from '../../../common/is_version_mismatch';
import { InitialAppData } from '../../../common/types';
import { VersionMismatchPage } from '../shared/version_mismatch';

import { AnalyticsCollectionView } from './components/analytics_collection_view/analytics_collection_view';
import { AnalyticsOverview } from './components/analytics_overview/analytics_overview';

import {
  ROOT_PATH,
  COLLECTION_VIEW_PATH,
  COLLECTION_INTEGRATE_PATH,
  COLLECTION_EXPLORER_PATH,
} from './routes';

export const Analytics: React.FC<InitialAppData> = (props) => {
  const { enterpriseSearchVersion, kibanaVersion } = props;
  const incompatibleVersions = isVersionMismatch(enterpriseSearchVersion, kibanaVersion);

  return (
    <Switch>
      <Route exact path={ROOT_PATH}>
        {incompatibleVersions ? (
          <VersionMismatchPage
            enterpriseSearchVersion={enterpriseSearchVersion}
            kibanaVersion={kibanaVersion}
          />
        ) : (
          <AnalyticsOverview />
        )}
      </Route>
      <Route exact path={COLLECTION_VIEW_PATH}>
        <AnalyticsCollectionView />
      </Route>

      <Route exact path={COLLECTION_INTEGRATE_PATH} />

      <Route exact path={COLLECTION_EXPLORER_PATH} />
    </Switch>
  );
};
