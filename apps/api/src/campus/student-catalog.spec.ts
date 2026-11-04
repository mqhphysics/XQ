import assert from 'node:assert/strict'
import test from 'node:test'
import { academicYearFromNumber, canonicalCollege, studentCatalog } from './student-catalog'

test('official colleges normalize recognizable source labels without guessing unknown affiliations', () => {
  for (const value of ['物理学院', '物理科学与技术', '物理科学与...（截断）', '物理科学技术学院'])
    assert.equal(canonicalCollege(value), '物理科学与技术学院')
  assert.equal(canonicalCollege('数统'), '数学与统计学学院')
  assert.equal(canonicalCollege('法学院青协'), '法学院')
  assert.equal(canonicalCollege('跨院联队'), null)
  assert.equal(canonicalCollege(''), '')
  const catalog = studentCatalog()
  assert.equal(catalog.colleges.length, new Set(catalog.colleges).size)
  assert.equal(catalog.colleges.length, 30)
})

test('student year comes from exactly ten digits, preserving plausible older students', () => {
  assert.equal(academicYearFromNumber('2025999999'), '2025级')
  assert.equal(academicYearFromNumber('2019999999'), '2019级')
  assert.equal(academicYearFromNumber('202599999'), '')
  assert.equal(academicYearFromNumber(null), '')
})
