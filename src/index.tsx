/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  registerDetailsViewSection,
  registerRoute,
  registerSidebarEntry,
} from '@kinvolk/headlamp-plugin/lib';
import { NodeReadinessRuleDetail } from './components/NodeReadinessRuleDetail';
import { NodeReadinessRule } from './model';
import { NodeReadinessInjected } from './NodeReadinessInjected';
import { RuleListView } from './RuleListView';

// Register sidebar navigation entry for Node Readiness Rules
registerSidebarEntry({
  parent: 'cluster',
  name: 'NodeReadinessRules',
  url: '/nrc/nodereadinessrules',
  icon: 'mdi:checkbox-marked-circle-outline',
  label: 'Node Readiness Rules',
});

// Register route for the Cluster-Wide Aggregated List View
registerRoute({
  path: '/nrc/nodereadinessrules',
  sidebar: 'NodeReadinessRules',
  name: 'Node Readiness Rules',
  exact: true,
  component: () => <RuleListView />,
});

// Register route for the Rule Details View
registerRoute({
  path: NodeReadinessRule.detailsRoute,
  sidebar: 'NodeReadinessRules',
  name: 'Node Readiness Rule Details',
  exact: true,
  component: () => <NodeReadinessRuleDetail />,
});

// Unified Node View Injection: Inject NRC condition breakdown & event breakdown into standard K8s Node Detail page
registerDetailsViewSection(({ resource }) => {
  if (resource && resource.kind === 'Node') {
    return <NodeReadinessInjected resource={resource} />;
  }
  return null;
});
