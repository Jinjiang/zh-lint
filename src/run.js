const replaceBlocks = require('./replace-block')
const parse = require('./parse')
const processRule = require('./process-rule')
const join = require('./join')
const findIgnoredMarks = require('./find-ignored-marks')
const { defaultLogger } = require('./logger')

const hyperParseInfo = [
  { name: 'ignore', value: require('./parsers/ignore') },
  { name: 'hexo', value: require('./parsers/hexo') },
  { name: 'vuepress', value: require('./parsers/vuepress') },
  { name: 'markdown', value: require('./parsers/md') }
]

/**
 * rules
 * - mark-raw: content-hyper: <code>...</code>|`...` -> one space outside
 * - mark-hyper: hyper-mark: if has space in seq then ensure space outside
 * - unify-punctuation:
 *   - half-width -> full-width,
 *     - except {half}:{half}
 * - abbr: e.g. Mr. vs.
 * - space-full-width-content: content-*:
 *   - <>...</> -> space outside,
 *   - different type -> one space
 * - space-punctuation: punctuation-*:
 *   - /[&%- -> void,
 *   - content before -> no space before, 
 *   - full-width -> no space beside
 *   - half-width -> one space after when either side is full-width content
 * - case-math-exp: punctuation-*: + - * / % =:
 *   - and 4 spaces,
 *   - except 0/0/0, 0-0-0, a-b, /, %, Chrome 53+
 * - case-backslash: \
 *   - half width and no raw space after -> no space after
 *   - full width before -> one space before
 * - space-brackets: mark-brackets:
 *   - half-width -> one space outside
 *   - half-width -> no space inside
 *     - add outside space out of marks
 * - space-quotes: group:
 *   - half-width -> one space outside, out of marks
 * - case-traditional: 「 『 』 」
 * - case-datetime: punctuation-*: 00:00:00
 * - case-datetime-zh: 0年0月0日0天0号0时0分0秒
 * - case-ellipsis: ...
 * - case-html-entity: &{half};
 * - case-raw: AC/DC
 * - case-linebreak: preserve all rawSpaceAfter includes '\n'
 * - mark-raw-review: remove unnecessary validations
 */
const rulesInfo = [
  { name: 'mark-raw', value: require('./rules/mark-raw') },
  { name: 'mark-hyper', value: require('./rules/mark-hyper') },
  { name: 'unify-punctuation', value: require('./rules/unify-punctuation') },
  { name: 'case-abbr', value: require('./rules/case-abbr') },
  { name: 'space-full-width-content', value: require('./rules/space-full-width-content') },
  { name: 'space-punctuation', value: require('./rules/space-punctuation') },
  { name: 'case-math-exp', value: require('./rules/case-math-exp') },
  { name: 'case-backslash', value: require('./rules/case-backslash') },
  { name: 'space-brackets', value: require('./rules/space-brackets') },
  { name: 'space-quotes', value: require('./rules/space-quotes') },
  { name: 'case-traditional', value: require('./rules/case-traditional') },
  { name: 'case-datetime', value: require('./rules/case-datetime') },
  { name: 'case-datetime-zh', value: require('./rules/case-datetime-zh') },
  { name: 'case-ellipsis', value: require('./rules/case-ellipsis') },
  { name: 'case-html-entity', value: require('./rules/case-html-entity') },
  { name: 'case-raw', value: require('./rules/case-raw') },
  { name: 'case-linebreak', value: require('./rules/case-linebreak') },
  // { name: 'mark-raw-review', value: require('./rules/mark-raw-review') }
]

const arrToMap = arr => arr.reduce((current, { name, value }) => {
  current[name] = value
  return current
}, {})

const hyperParseMap = arrToMap(hyperParseInfo)
const ruleMap = arrToMap(rulesInfo)

const matchCallArray = (calls, map) => calls.map(call => {
  switch (typeof call) {
    case 'function':
    return call
    case 'string':
    return map[call]
    default:
    return null
  }
}).filter(Boolean)

const run = (str, options = {}) => {
  const logger = options.logger || defaultLogger

  const disabledMatcher = /<\!\-\-\s*zhlint\s*disabled\s*\-\-\>/g
  if (str.match(disabledMatcher)) {
    return { origin: str, result: str, validations: [], disabled: true }
  }

  const rules = options.rules || rulesInfo.map(item => item.name)
  const hyperParse = options.hyperParse || hyperParseInfo.map(item => item.name)
  const ignoredCases = options.ignoredCases || []

  if (typeof hyperParse === 'function') {
    hyperParse = [hyperParse]
  }
  if (!Array.isArray) {
    hyperParse = [data => data]
  }

  // str -> ignoredByRules, ignoredByParsers
  // blocks -> marks, ignoredMarks
  const data = {
    content: str,
    raw: str,
    ignoredByRules: ignoredCases,
    ignoredByParsers: [],
    blocks: [{
      value: str,
      marks: [],
      start: 0,
      end: str.length - 1
    }]
  }

  const allValidations = []
  const allIgnoredMarks = []

  const finalData = matchCallArray(hyperParse, hyperParseMap)
    .reduce((current, parse) => parse(current), data)
  const result = replaceBlocks(str, finalData.blocks.map(({ value, marks, start, end }) => {
    const result = parse(value, marks)
    const ignoredMarks = findIgnoredMarks(value, data.ignoredByRules, logger)
    matchCallArray(rules, ruleMap).forEach(rule => processRule(result, rule))
    ignoredMarks.forEach(mark => allIgnoredMarks.push(mark))
    return {
      start, end,
      value: join(result.tokens, ignoredMarks, allValidations, start)
    }
  }))

  const validations = allValidations.filter(({ index }) =>
    allIgnoredMarks.length
      ? allIgnoredMarks.some(
        ({ start, end }) => index >= start && index <= end)
      : true)

  return { origin: str, result, validations }
}

module.exports = run
