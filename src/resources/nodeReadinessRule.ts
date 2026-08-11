import { KubeObject, KubeObjectInterface } from '@kinvolk/headlamp-plugin/lib/K8s/cluster';

export interface EvaluatedNodeInfo {
  name: string;
  status?: string;
  message?: string;
}

export interface NodeEvaluationObject {
  nodeName?: string;
  name?: string;
  ready?: boolean;
  status?: string;
  message?: string;
  [key: string]: any;
}

export interface NodeReadinessRuleSpec {
  enforcementMode?: string;
  conditionTypes?: string[];
  nodeSelector?: Record<string, string>;
  timeoutSeconds?: number;
  [key: string]: any;
}

export interface NodeReadinessRuleStatus {
  nodeEvaluations?: Array<string | NodeEvaluationObject>;
  appliedNodes?: Array<string | NodeEvaluationObject>;
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

  get enforcementMode(): string {
    return this.spec.enforcementMode || 'Not Specified';
  }

  get evaluatedNodes(): EvaluatedNodeInfo[] {
    const rawNodes = this.status.nodeEvaluations || this.status.appliedNodes || [];
    return rawNodes.map(node => {
      if (typeof node === 'string') {
        return { name: node, status: 'Evaluated' };
      }
      return {
        name: node.nodeName || node.name || 'Unknown Node',
        status:
          node.status ||
          (node.ready === true ? 'Ready' : node.ready === false ? 'Not Ready' : 'Evaluated'),
        message: node.message,
      };
    });
  }
}
