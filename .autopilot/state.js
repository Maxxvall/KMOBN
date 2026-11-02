window.STATE =
{
  "version": 2,
  "slug": "estimate-section-order",
  "dir": "2026-11-02-estimate-section-order--wip",
  "title": "Порядок разделов сметы и единые иконки",
  "mode": "interview",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-02-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Administrator/.agents/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-02T21:17:28+03:00",
  "updatedAt": "2026-11-02T21:28:23+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-02T21:17:28+03:00",
      "finishedAt": "2026-11-02T21:18:00+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-02T21:18:00+03:00",
      "finishedAt": "2026-11-02T21:18:02+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-02T21:18:02+03:00",
      "finishedAt": "2026-11-02T21:23:41+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-02T21:23:41+03:00",
      "finishedAt": "2026-11-02T21:28:20+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-02T21:28:20+03:00"
    },
    {
      "id": "build",
      "status": "pending"
    },
    {
      "id": "review",
      "status": "pending"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 16,
    "done": 0,
    "inTicket": 16,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Перемещение разделов, сохранение порядка и иконки редактора",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09",
        "R10i",
        "R11i",
        "R12i",
        "R13i",
        "G01",
        "G02",
        "G03"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "services/estimateSections.ts",
        "services/estimateSections.test.ts",
        "services/estimateIntelligence.ts",
        "services/estimateIntelligence.test.ts",
        "services/dataTransfer.ts",
        "services/dataTransfer.test.ts",
        "services/estimateActuals.ts",
        "services/estimateActuals.test.ts",
        "services/*Pdf*.test.ts",
        "services/pdfGenerator.test.ts",
        "services/pdfContractGenerator.test.ts",
        "services/estimateLifecycle.test.ts",
        "services/clientEstimate.test.ts",
        "components/EstimateEditor.tsx",
        "components/estimateEditorSignature.ts",
        "components/estimateEditorSignature.test.ts",
        "components/estimate-editor/",
        "components/Analytics.tsx",
        "components/AIGenerationModal.tsx",
        "components/AIMissingItemsModal.tsx",
        "components/AILoadingIndicator.tsx",
        "components/CrewToolPlanPanel.tsx",
        "components/BoardMaterialSwitchModal.tsx",
        "components/BundlePickerModal.tsx",
        "components/PasteFromEstimateModal.tsx",
        "components/VersionComparisonModal.tsx"
      ],
      "review": "нет — T0, ревью всей ветки закрывает таск целиком",
      "model": "сильная — touch/long-press и сквозное сохранение порядка",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    }
  ],
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 0,
    "fixed": 0,
    "deferred": 0,
    "items": [
      "Независимая сверка: просьбы пользователя покрыты; уточнения жеста/сохранения относятся к исходным требованиям"
    ]
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-02T21:17:28+03:00",
    "2026-11-02T21:18:00+03:00",
    "2026-11-02T21:18:02+03:00",
    "2026-11-02T21:18:14+03:00",
    "2026-11-02T21:20:43+03:00",
    "2026-11-02T21:20:45+03:00",
    "2026-11-02T21:23:41+03:00",
    "2026-11-02T21:28:19+03:00",
    "2026-11-02T21:28:20+03:00",
    "2026-11-02T21:28:21+03:00",
    "2026-11-02T21:28:22+03:00",
    "2026-11-02T21:28:23+03:00"
  ],
  "rev": 14,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-02T21:18:14+03:00",
      "to": "2026-11-02T21:20:43+03:00"
    },
    {
      "kind": "briefing",
      "from": "2026-11-02T21:20:45+03:00",
      "to": "2026-11-02T21:23:41+03:00"
    }
  ],
  "log": [
    {
      "t": "2026-11-02T21:17:28+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-02T21:18:00+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-02T21:18:02+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-02T21:18:14+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "Уточняем захват раздела, область порядка, иконки и остатки прошлой сборки"
    },
    {
      "t": "2026-11-02T21:20:43+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-02T21:20:45+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "Последние два уточнения: новые разделы и перенос на сенсорном экране"
    },
    {
      "t": "2026-11-02T21:23:41+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-02T21:23:41+03:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 16,
      "total": 16
    },
    {
      "t": "2026-11-02T21:23:41+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-02T21:28:19+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    {
      "t": "2026-11-02T21:28:20+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-02T21:28:21+03:00",
      "k": "tier",
      "v": "T0"
    },
    {
      "t": "2026-11-02T21:28:22+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-02T21:28:23+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«при задержании на кровле, например, я долго держу мышкой, я мог его перенести на второе место»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«перемещать их между собой, как захочу»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«он там выделился, и я его переношу»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«как карточки, такими перемещать можно было бы»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«соответственно и в PDF-ах он должен также сохраняться»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«вот эти все в сметах смайлики заменить на иконки. Красивые, подходящие»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«Крестики эти все разные, почему-то тут фиолетовый, тут красный»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«из другой сметы, дублировать»",
      "status": "in-ticket"
    },
    {
      "id": "R09",
      "text": "«сворачивание и редактирование, добавить примечание, то есть должны быть иконки»",
      "status": "in-ticket"
    },
    {
      "id": "R10i",
      "text": "(подразумевается) порядок остаётся после сохранения и повторного открытия сметы",
      "status": "in-ticket"
    },
    {
      "id": "R11i",
      "text": "(подразумевается) короткое нажатие продолжает сворачивать раздел, перенос не вызывает случайного сворачивания",
      "status": "in-ticket"
    },
    {
      "id": "R12i",
      "text": "(подразумевается) строки, количества, суммы и примечания остаются в своём разделе",
      "status": "in-ticket"
    },
    {
      "id": "R13i",
      "text": "(подразумевается) новая нумерация разделов соответствует новому порядку",
      "status": "in-ticket"
    },
    {
      "id": "G01",
      "text": "«В текущей смете и всех её документах (рекомендую)»",
      "status": "in-ticket"
    },
    {
      "id": "G02",
      "text": "«Новый — в конец, старые сами не переставлять (рекомендую)»",
      "status": "in-ticket"
    },
    {
      "id": "G03",
      "text": "«Да, мышью и пальцем (рекомендую)»",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-11-02T21:23:41+03:00",
      "open": 16,
      "total": 16
    },
    "G2": {
      "ok": true,
      "at": "2026-11-02T21:28:19+03:00",
      "found": 0,
      "fixed": 0,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-02T21:28:23+03:00",
      "problems": 0
    }
  },
  "result": null
}
