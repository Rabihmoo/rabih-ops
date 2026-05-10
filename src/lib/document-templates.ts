import type {
  DocumentCategory,
  DocumentStatus,
  DocumentVisibility,
} from '@/types/database';

// Built-in templates — no DB row, just code. Selecting one prefills
// the new-document form; the user is free to edit anything before save.

export interface DocumentTemplateDraft {
  title: string;
  category: DocumentCategory;
  visibility: DocumentVisibility;
  status?: DocumentStatus;
  body_md: string;
}

export interface DocumentTemplate {
  id: string;
  label: string;
  description: string;
  draft: DocumentTemplateDraft;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'sop',
    label: 'SOP',
    description: 'Standard operating procedure for a recurring task.',
    draft: {
      title: 'SOP — <task name>',
      category: 'sop',
      visibility: 'work',
      status: 'draft',
      body_md: `# Purpose
What this procedure achieves and why it matters.

# Scope
Where this applies (branches / departments / shifts).

# Roles
- **Owner**:
- **Performed by**:
- **Reviewed by**:

# Tools & materials
-

# Steps
1.
2.
3.

# Quality check
How you confirm the work is done correctly.

# Frequency
How often this runs (daily / weekly / per-shift / on-trigger).

# Records
Where evidence is kept (paper log, photo, RabihOS task, etc.).

# Last reviewed
- Date:
- By:
`,
    },
  },
  {
    id: 'policy',
    label: 'Policy',
    description: 'A binding rule or guideline that staff must follow.',
    draft: {
      title: 'Policy — <topic>',
      category: 'policy',
      visibility: 'work',
      status: 'draft',
      body_md: `# Purpose
Why this policy exists.

# Scope
Who this applies to.

# Policy statement
The rule, in one or two clear sentences.

# Procedure
How the policy is enforced day to day.

# Exceptions
Cases where the rule is waived and who can authorise.

# Effective date

# Review date

# Owner
`,
    },
  },
  {
    id: 'cleaning-checklist',
    label: 'Cleaning checklist',
    description: 'Daily / weekly cleaning checklist for an area.',
    draft: {
      title: 'Cleaning checklist — <area>',
      category: 'checklist',
      visibility: 'work',
      status: 'draft',
      body_md: `# Area
e.g. Kitchen line, cold room, service area, full branch.

# Frequency
- [ ] Open shift
- [ ] Mid-shift
- [ ] Close shift
- [ ] Weekly deep clean

# Daily tasks
- [ ] Wipe surfaces
- [ ] Sweep + mop floors
- [ ] Empty bins
- [ ]

# Weekly tasks
- [ ] Degrease equipment
- [ ] Clean behind stations
- [ ] Inspect fridges (temperature log)
- [ ]

# Materials
- Sanitiser:
- Cloths:
- Other:

# Sign-off
- Performed by:
- Date / time:
- Verified by:
`,
    },
  },
  {
    id: 'supplier-profile',
    label: 'Supplier profile',
    description: 'Reference card for a vendor — contacts, terms, history.',
    draft: {
      title: 'Supplier — <company name>',
      category: 'reference',
      visibility: 'work',
      status: 'active',
      body_md: `# Company
**Name**:
**Address**:
**Website**:

# Primary contact
- **Name**:
- **Role**:
- **Phone**:
- **WhatsApp**:
- **Email**:

# Backup contact
- **Name**:
- **Phone**:

# Products / services we buy
-

# Payment terms
- Method (bank transfer / cash / mpesa / invoice 30d):
- Currency:
- Account / reference:

# Delivery schedule
- Days:
- Cut-off for orders:
- Lead time:

# History
- First used:
- Past issues:
- Notes:
`,
    },
  },
  {
    id: 'incident-report',
    label: 'Incident report',
    description: 'When something went wrong — capture facts and follow-ups.',
    draft: {
      title: 'Incident — <short description>',
      category: 'reference',
      visibility: 'work',
      status: 'draft',
      body_md: `# When
- **Date / time**:
- **Branch / area**:

# Who
- **People involved**:
- **Witnesses**:
- **Reported by**:

# What happened
A clear factual description. Avoid blame language.

# Immediate action taken

# Root cause (if known)

# Follow-up actions
- [ ]
- [ ]

# Linked records
- Tasks:
- Purchases:
- Inspections:

# Status
draft / open / resolved
`,
    },
  },
  {
    id: 'meeting-notes',
    label: 'Meeting notes',
    description: 'Decisions and action items from a team meeting.',
    draft: {
      title: 'Meeting — <topic> — <date>',
      category: 'note',
      visibility: 'work',
      status: 'active',
      body_md: `# When

# Attendees
-

# Agenda
1.
2.
3.

# Decisions
-

# Action items
| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 |        |       |     |
| 2 |        |       |     |

# Next meeting
- Date:
- Topic:
`,
    },
  },
  {
    id: 'personal-note',
    label: 'Personal note',
    description: 'Private to you. Not visible to anyone else, even admins.',
    draft: {
      title: 'Note — <topic>',
      category: 'personal',
      visibility: 'personal',
      status: 'draft',
      body_md: `# Topic

# Notes

# Follow up
-
`,
    },
  },
];
