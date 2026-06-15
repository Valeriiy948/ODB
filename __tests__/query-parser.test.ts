// __tests__/query-parser.test.ts
import { parseSearchQuery } from '../lib/search/query-parser'

type Case = {
  input: string
  check: Partial<ReturnType<typeof parseSearchQuery>>
}

const CASES: Case[] = [
  {
    input: 'Макарийчук Валерий Валериевич 10.10.1993',
    check: {
      lastName: 'Макарийчук',
      firstName: 'Валерий',
      middleName: 'Валериевич',
      dob: '1993-10-10',
      dobDay: 10,
      dobMonth: 10,
      dobYear: 1993,
      fullName: 'Макарийчук Валерий Валериевич',
      searchType: 'name',
    },
  },
  {
    input: 'Іванов Іван 1985',
    check: {
      lastName: 'Іванов',
      firstName: 'Іван',
      middleName: '',
      dobYear: 1985,
      dob: null,
      dobDay: null,
      dobMonth: null,
      fullName: 'Іванов Іван',
      searchType: 'name',
    },
  },
  {
    input: '+380501234567',
    check: {
      searchType: 'phone',
      phones: ['+380501234567'],
      fullName: '',
      lastName: '',
    },
  },
  {
    input: 'Петров Петро',
    check: {
      lastName: 'Петров',
      firstName: 'Петро',
      middleName: '',
      searchType: 'name',
      dob: null,
    },
  },
  {
    input: 'Smith John 1990-05-15',
    check: {
      dob: '1990-05-15',
      dobYear: 1990,
      dobMonth: 5,
      dobDay: 15,
      lastName: 'Smith',
      firstName: 'John',
      fullName: 'Smith John',
    },
  },
  {
    input: '0501234567',
    check: {
      searchType: 'phone',
      phones: ['+380501234567'],
      fullName: '',
    },
  },
  {
    input: 'Шевченко Тарас Григорович 09/03/1944',
    check: {
      lastName: 'Шевченко',
      firstName: 'Тарас',
      middleName: 'Григорович',
      dob: '1944-03-09',
      dobDay: 9,
      dobMonth: 3,
      dobYear: 1944,
    },
  },
  {
    input: 'Коваль',
    check: {
      lastName: 'Коваль',
      firstName: '',
      middleName: '',
      searchType: 'name',
    },
  },
  {
    input: 'test@example.com',
    check: {
      searchType: 'email',
      fullName: '',
    },
  },
]

let passed = 0
let failed = 0

for (const { input, check } of CASES) {
  const result = parseSearchQuery(input)
  for (const [key, expected] of Object.entries(check)) {
    const actual = result[key as keyof typeof result]
    const eq = JSON.stringify(actual) === JSON.stringify(expected)
    if (!eq) {
      console.error(`FAIL [${input}] .${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      failed++
    } else {
      passed++
    }
  }
}

if (failed === 0) {
  console.log(`✅ query-parser: всі ${passed} тверджень пройшли`)
} else {
  console.error(`❌ query-parser: ${failed} провалено, ${passed} пройшли`)
  process.exit(1)
}
