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

export type KubeObjectInterface = K8s.cluster.KubeObjectInterface;
export const KubeObject = K8s.cluster.KubeObject;

export interface ConditionEvaluation {
  type: string;
  required?: boolean | string;
  status: string; // e.g. "True", "False", "Unknown"
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface NodeEvaluation {
  nodeName: string;
  ready?: boolean;
  held?: boolean;
  bootstrapCompleted?: boolean;
  status?: string;
  message?: string;
  conditions?: ConditionEvaluation[];
  observedConditions?: Record<string, string>;
  requiredConditions?: Record<string, string>;
  [key: string]: any;
}

export interface NodeReadinessRuleSpec {
  enforcementMode?: 'continuous' | 'bootstrap-only' | 'dryRun' | string;
  dryRun?: boolean;
  conditionTypes?: string[];
  nodeSelector?: Record<string, string>;
  timeoutSeconds?: number;
  taint?: {
    key?: string;
    value?: string;
    effect?: string;
  };
  [key: string]: any;
}

export interface NodeReadinessRuleStatus {
  matchedNodesCount?: number;
  heldNodesCount?: number;
  completedNodesCount?: number;
  nodeEvaluations?: Array<string | NodeEvaluation>;
  appliedNodes?: Array<string | NodeEvaluation>;
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }>;
  [key: string]: any;
}

export interface NodeReadinessRuleInterface extends KubeObjectInterface {
  spec: NodeReadinessRuleSpec;
  status?: NodeReadinessRuleStatus;
}

/**
 * KubeObject model for NodeReadinessRule CRD (`nrc.x-k8s.io/v1alpha1`).
 * Encapsulates O(1) aggregation metrics and enforcement mode semantics.
 */
export class NodeReadinessRule extends KubeObject<NodeReadinessRuleInterface> {
  static kind = 'NodeReadinessRule';
  static apiName = 'nodereadinessrules';
  static apiVersion = 'nrc.x-k8s.io/v1alpha1';
  static isNamespaced = true;

  static get detailsRoute(): string {
    return '/nrc/nodereadinessrules/:namespace/:name';
  }

  get spec(): NodeReadinessRuleSpec {
    return this.jsonData.spec || {};
  }

  get status(): NodeReadinessRuleStatus {
    return this.jsonData.status || {};
  }

  /**
   * Helper to check if the rule is running in dryRun mode (simulation / projection).
   */
  get isDryRun(): boolean {
    return (
      this.spec.dryRun === true ||
      (typeof this.spec.enforcementMode === 'string' &&
        this.spec.enforcementMode.toLowerCase() === 'dryrun')
    );
  }

  /**
   * Enforcement Mode semantics:
   * - continuous: Live ongoing state enforcement
   * - bootstrap-only: Enforces condition until initial node bootstrap completion
   * - dryRun: Simulation/projection without active node taints
   */
  get enforcementMode(): 'continuous' | 'bootstrap-only' | 'dryRun' | string {
    if (this.isDryRun) {
      return 'dryRun';
    }
    return this.spec.enforcementMode || 'continuous';
  }

  /**
   * O(1) Counter: Total nodes matching rule selector
   */
  get matchedCount(): number {
    if (typeof this.status.matchedNodesCount === 'number') {
      return this.status.matchedNodesCount;
    }
    return this.evaluations.length;
  }

  /**
   * O(1) Counter: Nodes currently held/tainted by NRC awaiting readiness
   */
  get heldCount(): number {
    if (typeof this.status.heldNodesCount === 'number') {
      return this.status.heldNodesCount;
    }
    return this.evaluations.filter(ev => ev.held === true || ev.ready === false).length;
  }

  /**
   * O(1) Counter: Nodes that have completed bootstrap / readiness requirements
   */
  get completedCount(): number {
    if (typeof this.status.completedNodesCount === 'number') {
      return this.status.completedNodesCount;
    }
    return this.evaluations.filter(ev => ev.bootstrapCompleted === true || ev.ready === true)
      .length;
  }

  /**
   * Derived list of node evaluations normalized into structured NodeEvaluation objects
   */
  get evaluations(): NodeEvaluation[] {
    const raw = this.status.nodeEvaluations || this.status.appliedNodes || [];
    return raw.map(item => {
      if (typeof item === 'string') {
        return {
          nodeName: item,
          ready: true,
          held: false,
          bootstrapCompleted: true,
          status: 'Evaluated',
        };
      }
      return {
        ...item,
        nodeName: item.nodeName || item.name || 'Unknown Node',
        ready: item.ready ?? item.status === 'Ready',
        held: item.held ?? item.ready === false,
        bootstrapCompleted: item.bootstrapCompleted ?? item.ready === true,
        status: item.status || (item.ready ? 'Ready' : 'Not Ready'),
        message: item.message,
        conditions: item.conditions || [],
        observedConditions: item.observedConditions || {},
        requiredConditions: item.requiredConditions || {},
      };
    });
  }

  /**
   * Compatibility getter for legacy evaluatedNodes format
   */
  get evaluatedNodes(): Array<{ name: string; status: string; message?: string }> {
    return this.evaluations.map(ev => ({
      name: ev.nodeName,
      status: ev.status || (ev.ready ? 'Ready' : 'Not Ready'),
      message: ev.message,
    }));
  }

  /**
   * Gets evaluation breakdown for a specific node name
   */
  getEvaluationForNode(nodeName: string): NodeEvaluation | undefined {
    return this.evaluations.find(ev => ev.nodeName === nodeName);
  }

  /**
   * Helper to check if a node evaluation has exceeded spec.timeoutSeconds (stalled bootstrap).
   */
  isNodeTimedOut(nodeName: string): boolean {
    const evalData = this.getEvaluationForNode(nodeName);
    if (!evalData || !evalData.held || !this.spec.timeoutSeconds) {
      return false;
    }

    if (evalData.startTime || evalData.lastTransitionTime || evalData.timestamp) {
      const startTime = new Date(
        evalData.startTime || evalData.lastTransitionTime || evalData.timestamp || ''
      ).getTime();
      if (!isNaN(startTime)) {
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        return elapsedSeconds > this.spec.timeoutSeconds;
      }
    }

    return evalData.timedOut === true || evalData.stalled === true;
  }
}
