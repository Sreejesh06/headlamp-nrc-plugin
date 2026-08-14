import { useMemo } from 'react';
import { NodeReadinessRule } from '../model';

export interface NodeImpact {
  nodeName: string;
  isHeld: boolean;
  isDryRunHeld: boolean;
  heldBy: NodeReadinessRule[];
  dryRunBy: NodeReadinessRule[];
  enforcementModes: Set<string>;
}

export function useNodeReadinessMap() {
  const [rules, error] = NodeReadinessRule.useList();

  // Memoize the map calculation based on the stable array reference from Headlamp's store.
  // This ensures we only parse `nodeEvaluations` ONCE per store update,
  // making per-row lookup in the Nodes table O(1).
  const nodeImpactMap = useMemo(() => {
    const map = new Map<string, NodeImpact>();

    if (!rules) return map;

    rules.forEach(rule => {
      const isDryRun = rule.spec?.dryRun === true || rule.spec?.enforcementMode === 'dryRun';
      const enforcementMode = rule.spec?.enforcementMode || 'continuous';

      rule.status?.nodeEvaluations?.forEach((evaluation: any) => {
        if (!evaluation.held) return;

        const nodeName = evaluation.nodeName;
        if (!map.has(nodeName)) {
          map.set(nodeName, {
            nodeName,
            isHeld: false,
            isDryRunHeld: false,
            heldBy: [],
            dryRunBy: [],
            enforcementModes: new Set<string>(),
          });
        }

        const impact = map.get(nodeName)!;
        impact.enforcementModes.add(enforcementMode);

        if (isDryRun) {
          impact.isDryRunHeld = true;
          impact.dryRunBy.push(rule);
        } else {
          impact.isHeld = true;
          impact.heldBy.push(rule);
        }
      });
    });

    return map;
  }, [rules]);

  return { nodeImpactMap, error, isLoading: !rules && !error, rules };
}
