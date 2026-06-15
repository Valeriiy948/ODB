// lib/prompts/investigator-profile.ts
// Structured investigator prompt — 6-step reasoning chain for war crimes analysis.
// Versioned here so it can be tested and improved independently of the API route.

export const INVESTIGATOR_SYSTEM_PROMPT = `\
You are a Senior War Crimes Intelligence Analyst with 15+ years of field experience.
You specialize in building evidentiary profiles for ICC prosecutions and Ukrainian courts (VAKS).
You work for the International Criminal Evidence Unit.

ANALYTICAL FRAMEWORK — apply ALL 6 steps in sequence:

STEP 1 · IDENTITY VERIFICATION
  Cross-reference every available identifier: name variants, date of birth, passport series,
  tax ID (IPN/INN/SNILS), phone numbers, social media handles.
  Assign identity confidence: HIGH (multiple corroborating IDs) / MEDIUM (partial match)
  / LOW (name only, no documents).
  Flag conflicting data points — they may indicate identity fraud or data errors.

STEP 2 · MILITARY ROLE & COMMAND CHAIN
  Establish: rank, unit designation, unit number (в/ч), position held.
  Determine position in command hierarchy: strategic / operational / tactical level.
  Apply command responsibility doctrine (ICC Art. 28): did this person have effective
  control over subordinates who committed crimes?

STEP 3 · CRIMINAL ATTRIBUTION
  For each incident: specify role (commander / executor / organizer / facilitator / witness),
  date, location, crime type, applicable ICC article.
  Distinguish between direct perpetration and superior responsibility.
  Note if any incident has corroborating evidence vs. a single-source claim.

STEP 4 · EVIDENCE QUALITY ASSESSMENT
  Classify each data category:
    PRIMARY   — direct physical/digital evidence, official documents, intercepts
    SECONDARY — leak databases, social media, witness statements
    CIRCUMSTANTIAL — inference from position, presence, unit affiliation
  Identify the two or three strongest evidence points.
  Flag unreliable, unverified, or potentially fabricated data.

STEP 5 · LEGAL FRAMEWORK MAPPING
  Map the subject's conduct to:
    – ICC Rome Statute articles (most common: Art. 7 Crimes Against Humanity,
      Art. 8 War Crimes, Art. 28 Command Responsibility)
    – Ukrainian Criminal Code articles (most common: 437, 438, 439, 442)
  Assess prosecution viability:
    STRONG      — direct evidence, established identity, clear causal link
    POSSIBLE    — strong circumstantial, identity confirmed, gaps manageable
    WEAK        — significant gaps, identity uncertain, circumstantial only
    INSUFFICIENT — too little data to support prosecution at this time

STEP 6 · GAP DETECTOR
  List information that is CRITICAL but MISSING and would materially strengthen prosecution.
  Prioritize gaps by impact (HIGH / MEDIUM / LOW).
  For each gap suggest a concrete investigative action (e.g., "Subpoena VK account logs",
  "Request MVS vehicle registration", "Cross-check SNILS with Pension Fund RF").
  Estimate realistic fill timeline: days / weeks / months.

OUTPUT RULES:
  – Reply ONLY with valid JSON. Zero text outside the JSON object.
  – Do not wrap in markdown code fences.
  – All string values in Ukrainian (Cyrillic). Field names in English (as specified).
  – null for genuinely unknown fields. Empty array [] for empty lists.
  – analyst_note must include your confidence in the overall analysis quality.`

// ── Output schema type (for documentation / future validation) ─────────────
export interface InvestigatorProfile {
  threat_level:           'критичний' | 'високий' | 'середній' | 'низький' | 'невідомий'
  confidence_score:       number   // 0–100
  prosecution_viability:  'strong' | 'possible' | 'weak' | 'insufficient'
  role:                   string
  summary:                string

  reasoning_chain: {
    step1_identity: {
      confidence:       'high' | 'medium' | 'low'
      key_identifiers:  string[]
      inconsistencies:  string[]
      notes:            string | null
    }
    step2_military: {
      rank:                   string | null
      unit:                   string | null
      hierarchy_level:        'strategic' | 'operational' | 'tactical' | null
      command_responsibility: boolean
      superior_officers:      string[]
      notes:                  string | null
    }
    step3_attribution: {
      crimes_confirmed:   number
      strongest_case:     string | null
      role_assessment:    string
      direct_evidence:    boolean
      notes:              string | null
    }
    step4_evidence: {
      overall_quality:    'strong' | 'moderate' | 'weak'
      primary:            string[]
      secondary:          string[]
      circumstantial:     string[]
      reliability_issues: string[]
    }
    step5_legal: {
      icc_articles:           string[]
      ua_articles:            string[]
      prosecution_viability:  string
      viability_rationale:    string
    }
    step6_gaps: {
      critical_gaps: Array<{
        gap:        string
        impact:     'high' | 'medium' | 'low'
        action:     string
        timeline:   'days' | 'weeks' | 'months'
      }>
      investigative_priorities: string[]
    }
  }

  identification: {
    full_name:    string
    dob:          string | null
    nationality:  string | null
    documents:    string[]
    addresses:    string[]
    phone_numbers: string[]
    social_media: string[]
  }
  military: {
    unit:             string | null
    rank:             string | null
    unit_number:      string | null
    role_description: string | null
  }
  crimes: Array<{
    title:       string
    date:        string | null
    location:    string | null
    type:        string
    severity:    'critical' | 'high' | 'medium' | 'low'
    icc_article: string | null
    ua_article:  string | null
    role:        string
    evidence:    string | null
  }>
  digital_footprint: {
    phones:       string[]
    emails:       string[]
    social:       string[]
    leaks_count:  number
    leak_sources: string[]
  }
  connections:       string[]
  evidence_summary:  string | null
  icc_articles:      string[]
  ua_criminal_articles: string[]
  key_facts:         string[]
  recommendations:   string[]
  information_gaps:  string[]
  analyst_note:      string
}

/**
 * Build the user-turn message with structured data + 6-step framework instructions.
 */
export function buildInvestigatorPrompt(
  context: string,
  personName: string,
  threatScore: number,
): string {
  return `\
## SUBJECT OF ANALYSIS
Name: ${personName}
Preliminary threat score (algorithmic): ${threatScore}/100

## COLLECTED INTELLIGENCE DATA
${context}

## TASK
Apply the 6-step investigator framework to this subject.
Work through each step systematically before generating output.

Produce ONLY the following JSON (no text before or after):

{
  "threat_level": "критичний|високий|середній|низький|невідомий",
  "confidence_score": 0,
  "prosecution_viability": "strong|possible|weak|insufficient",
  "role": "командир|виконавець|організатор|пособник|свідок|цивільний|невідомо",
  "summary": "2-3 речення загального резюме для керівника слідства",

  "reasoning_chain": {
    "step1_identity": {
      "confidence": "high|medium|low",
      "key_identifiers": [],
      "inconsistencies": [],
      "notes": null
    },
    "step2_military": {
      "rank": null,
      "unit": null,
      "hierarchy_level": "strategic|operational|tactical|null",
      "command_responsibility": false,
      "superior_officers": [],
      "notes": null
    },
    "step3_attribution": {
      "crimes_confirmed": 0,
      "strongest_case": null,
      "role_assessment": "",
      "direct_evidence": false,
      "notes": null
    },
    "step4_evidence": {
      "overall_quality": "strong|moderate|weak",
      "primary": [],
      "secondary": [],
      "circumstantial": [],
      "reliability_issues": []
    },
    "step5_legal": {
      "icc_articles": [],
      "ua_articles": [],
      "prosecution_viability": "strong|possible|weak|insufficient",
      "viability_rationale": ""
    },
    "step6_gaps": {
      "critical_gaps": [
        { "gap": "", "impact": "high|medium|low", "action": "", "timeline": "days|weeks|months" }
      ],
      "investigative_priorities": []
    }
  },

  "identification": {
    "full_name": "",
    "dob": null,
    "nationality": null,
    "documents": [],
    "addresses": [],
    "phone_numbers": [],
    "social_media": []
  },
  "military": {
    "unit": null,
    "rank": null,
    "unit_number": null,
    "role_description": null
  },
  "crimes": [],
  "digital_footprint": {
    "phones": [],
    "emails": [],
    "social": [],
    "leaks_count": 0,
    "leak_sources": []
  },
  "connections": [],
  "evidence_summary": null,
  "icc_articles": [],
  "ua_criminal_articles": [],
  "key_facts": [],
  "recommendations": [],
  "information_gaps": [],
  "analyst_note": ""
}`
}
