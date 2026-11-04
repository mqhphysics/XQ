import {
  CompetitionRuleError,
  requireRule,
  validateRules,
  type CompetitionRules,
} from './competition-rules'

export function parseResultsRules(ruleVersionId: string, document: unknown): CompetitionRules {
  try {
    requireRule(
      typeof document === 'object' && document !== null && !Array.isArray(document),
      'RESULTS_RULES_REQUIRED',
    )
    const results = (document as Record<string, unknown>).results
    requireRule(
      typeof results === 'object' && results !== null && !Array.isArray(results),
      'RESULTS_RULES_REQUIRED',
    )
    const rule = results as Record<string, unknown>
    requireRule(
      Object.keys(rule).every((key) =>
        [
          'points',
          'tieBreakers',
          'headToHead',
          'groupShootout',
          'knockoutShootout',
          'forfeit',
        ].includes(key),
      ),
      'UNSUPPORTED_RESULTS_RULES',
    )
    const rules = { ...rule, ruleVersionId } as unknown as CompetitionRules
    requireRule(
      ['win', 'draw', 'loss'].every(
        (key) => typeof (rules.points as unknown as Record<string, unknown>)[key] === 'number',
      ),
      'INVALID_POINTS',
    )
    requireRule(
      Array.isArray(rules.tieBreakers) && Array.isArray(rules.headToHead.criteria),
      'INVALID_TIE_BREAKERS',
    )
    requireRule(
      rules.forfeit.both === null ||
        (typeof rules.forfeit.both === 'object' && rules.forfeit.both !== undefined),
      'INVALID_FORFEIT_RULES',
    )
    validateRules(rules)
    return rules
  } catch (error) {
    if (error instanceof CompetitionRuleError) throw error
    throw new CompetitionRuleError('INVALID_RESULTS_RULES')
  }
}
