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

import { K8s } from '@kinvolk/headlamp-plugin/lib';
import store from '@kinvolk/headlamp-plugin/lib/redux/stores/store';
import { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { NodeReadinessRule } from './model';
import { NodeReadinessInjected } from './NodeReadinessInjected';

// Mock Node object
const mockNode = {
  kind: 'Node',
  apiVersion: 'v1',
  getName: () => 'node-worker-01',
  metadata: {
    name: 'node-worker-01',
    uid: 'node-uid-1',
  },
} as any;

// Mock rules evaluating node-worker-01
const mockContinuousRule = new NodeReadinessRule({
  apiVersion: 'nrc.x-k8s.io/v1alpha1',
  kind: 'NodeReadinessRule',
  metadata: {
    name: 'k8s-node-memory-check',
    namespace: 'default',
    creationTimestamp: '2026-08-11T12:00:00Z',
    uid: 'rule-1',
  },
  spec: {
    enforcementMode: 'continuous',
    timeoutSeconds: 300,
    taint: {
      key: 'nrc.x-k8s.io/unschedulable',
      effect: 'NoSchedule',
    },
  },
  status: {
    nodeEvaluations: [
      {
        nodeName: 'node-worker-01',
        ready: false,
        held: true,
        timedOut: true,
        startTime: '2026-08-11T12:00:00Z',
        conditions: [
          { type: 'MemoryPressure', required: 'False', status: 'False' },
          { type: 'DiskPressure', required: 'False', status: 'True' },
        ],
      },
    ],
  },
});

const mockDryRunRule = new NodeReadinessRule({
  apiVersion: 'nrc.x-k8s.io/v1alpha1',
  kind: 'NodeReadinessRule',
  metadata: {
    name: 'ebs-csi-mount-simulation',
    namespace: 'default',
    creationTimestamp: '2026-08-11T14:00:00Z',
    uid: 'rule-2',
  },
  spec: {
    enforcementMode: 'dryRun',
    dryRun: true,
  },
  status: {
    nodeEvaluations: [
      {
        nodeName: 'node-worker-01',
        ready: true,
        conditions: [
          { type: 'VolumeMounted', required: 'True', status: 'True' },
        ],
      },
    ],
  },
});

const mockEvents = [
  {
    type: 'Warning',
    reason: 'NodeReadinessTaintApplied',
    message: 'Applied taint nrc.x-k8s.io/unschedulable due to DiskPressure condition on NodeReadinessRule k8s-node-memory-check',
    involvedObject: { kind: 'Node', name: 'node-worker-01' },
    lastOccurrence: '2 mins ago',
    metadata: { creationTimestamp: '2026-08-11T14:20:00Z' },
  },
];

const mockPods = [
  {
    getName: () => 'frontend-deployment-789bf-x8k2',
    getNamespace: () => 'prod-frontend',
    getAge: () => '12m',
    status: {
      phase: 'Pending',
      reason: 'Unschedulable',
      message: '0/5 nodes are available: 1 node(s) had untolerated taint {nrc.x-k8s.io/unschedulable: }',
    },
    spec: {
      nodeName: 'node-worker-01',
    },
  },
  {
    getName: () => 'redis-cache-master-0',
    getNamespace: () => 'prod-cache',
    getAge: () => '8m',
    status: {
      phase: 'Pending',
      reason: 'Unschedulable',
      message: '0/5 nodes are available: 1 node(s) had untolerated taint {nrc.x-k8s.io/unschedulable: }',
    },
    spec: {
      nodeName: 'node-worker-01',
    },
  },
] as any;

const meta: Meta<typeof NodeReadinessInjected> = {
  title: 'NRC Plugin/NodeReadinessInjected',
  component: NodeReadinessInjected,
  decorators: [
    Story => {
      NodeReadinessRule.useList = (() => [
        [mockContinuousRule, mockDryRunRule],
        null,
      ]) as any;

      K8s.event.default.useList = (() => [mockEvents, null]) as any;
      K8s.ResourceClasses.Pod.useList = (() => [mockPods, null]) as any;

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

type Story = StoryObj<typeof NodeReadinessInjected>;

export const InjectedNodeView: Story = {
  render: () => <NodeReadinessInjected resource={mockNode} />,
};
