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

import { describe, expect, it } from 'vitest';
import { NodeReadinessRule } from './model';

const mockMetadata = {
  name: 'test-rule',
  namespace: 'default',
  creationTimestamp: '2026-01-01T00:00:00Z',
  uid: '12345',
};

describe('NodeReadinessRule Model', () => {
  it('correctly calculates enforcement mode and dryRun state', () => {
    const rule = new NodeReadinessRule({
      apiVersion: 'nrc.x-k8s.io/v1alpha1',
      kind: 'NodeReadinessRule',
      metadata: mockMetadata,
      spec: {
        enforcementMode: 'bootstrap-only',
        timeoutSeconds: 300,
        conditionTypes: ['NetworkReady'],
      },
    });

    expect(rule.enforcementMode).toBe('bootstrap-only');
    expect(rule.isDryRun).toBe(false);
  });

  it('correctly identifies dryRun mode from spec.dryRun flag', () => {
    const rule = new NodeReadinessRule({
      apiVersion: 'nrc.x-k8s.io/v1alpha1',
      kind: 'NodeReadinessRule',
      metadata: { ...mockMetadata, name: 'dryrun-rule' },
      spec: {
        dryRun: true,
        enforcementMode: 'continuous',
      },
    });

    expect(rule.isDryRun).toBe(true);
    expect(rule.enforcementMode).toBe('dryRun');
  });

  it('correctly calculates matched, held, and completed counts from status', () => {
    const rule = new NodeReadinessRule({
      apiVersion: 'nrc.x-k8s.io/v1alpha1',
      kind: 'NodeReadinessRule',
      metadata: { ...mockMetadata, name: 'counter-rule' },
      spec: {},
      status: {
        matchedNodesCount: 5,
        heldNodesCount: 2,
        completedNodesCount: 3,
        nodeEvaluations: [
          { nodeName: 'node-1', ready: false, held: true },
          { nodeName: 'node-2', ready: true, bootstrapCompleted: true },
        ],
      },
    });

    expect(rule.matchedCount).toBe(5);
    expect(rule.heldCount).toBe(2);
    expect(rule.completedCount).toBe(3);
  });

  it('detects timed out nodes based on timeoutSeconds and evaluation timestamp', () => {
    const pastTime = new Date(Date.now() - 500 * 1000).toISOString();
    const rule = new NodeReadinessRule({
      apiVersion: 'nrc.x-k8s.io/v1alpha1',
      kind: 'NodeReadinessRule',
      metadata: { ...mockMetadata, name: 'timeout-rule' },
      spec: {
        timeoutSeconds: 300,
      },
      status: {
        nodeEvaluations: [
          {
            nodeName: 'stalled-node',
            held: true,
            startTime: pastTime,
          },
        ],
      },
    });

    expect(rule.isNodeTimedOut('stalled-node')).toBe(true);
  });
});
