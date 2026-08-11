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

import store from '@kinvolk/headlamp-plugin/lib/redux/stores/store';
import { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { NodeReadinessRule } from './model';
import { RuleListView } from './RuleListView';

// Create mock NodeReadinessRule instances for Storybook preview
const mockContinuousRule = new NodeReadinessRule({
  apiVersion: 'nrc.x-k8s.io/v1alpha1',
  kind: 'NodeReadinessRule',
  metadata: {
    name: 'k8s-node-memory-check',
    namespace: 'default',
    creationTimestamp: '2026-08-11T12:00:00Z',
    uid: '1',
  },
  spec: {
    enforcementMode: 'continuous',
    conditionTypes: ['MemoryPressure', 'DiskPressure'],
    nodeSelector: { 'node-role.kubernetes.io/worker': 'true' },
    timeoutSeconds: 300,
  },
  status: {
    matchedNodesCount: 12,
    heldNodesCount: 2,
    completedNodesCount: 10,
    nodeEvaluations: [
      { nodeName: 'node-worker-1', ready: true, bootstrapCompleted: true },
      { nodeName: 'node-worker-2', ready: false, held: true, message: 'Awaiting MemoryPressure clear' },
    ],
  },
});

const mockBootstrapRule = new NodeReadinessRule({
  apiVersion: 'nrc.x-k8s.io/v1alpha1',
  kind: 'NodeReadinessRule',
  metadata: {
    name: 'gpu-driver-bootstrap-check',
    namespace: 'kube-system',
    creationTimestamp: '2026-08-10T08:30:00Z',
    uid: '2',
  },
  spec: {
    enforcementMode: 'bootstrap-only',
    conditionTypes: ['NvidiaGPUReady'],
    nodeSelector: { accelerator: 'nvidia-gpu' },
    timeoutSeconds: 600,
  },
  status: {
    matchedNodesCount: 8,
    heldNodesCount: 0,
    completedNodesCount: 8,
    nodeEvaluations: [
      { nodeName: 'node-gpu-1', ready: true, bootstrapCompleted: true },
    ],
  },
});

const mockDryRunRule = new NodeReadinessRule({
  apiVersion: 'nrc.x-k8s.io/v1alpha1',
  kind: 'NodeReadinessRule',
  metadata: {
    name: 'ebs-csi-mount-simulation',
    namespace: 'default',
    creationTimestamp: '2026-08-11T14:15:00Z',
    uid: '3',
  },
  spec: {
    enforcementMode: 'dryRun',
    dryRun: true,
    conditionTypes: ['VolumeMounted'],
    nodeSelector: {},
  },
  status: {
    matchedNodesCount: 20,
    heldNodesCount: 4,
    completedNodesCount: 16,
  },
});

const meta: Meta<typeof RuleListView> = {
  title: 'NRC Plugin/RuleListView',
  component: RuleListView,
  decorators: [
    Story => {
      // Mock NodeReadinessRule.useList to return sample data in Storybook
      NodeReadinessRule.useList = (() => [
        [mockContinuousRule, mockBootstrapRule, mockDryRunRule],
        null,
      ]) as any;

      return (
        <Provider store={store}>
          <MemoryRouter>
            <Story />
          </MemoryRouter>
        </Provider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof RuleListView>;

export const Default: Story = {
  render: () => <RuleListView />,
};
