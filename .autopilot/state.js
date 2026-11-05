window.STATE =
{
  "version": 2,
  "slug": "estimate-labels",
  "dir": "2026-11-05-estimate-labels--wip",
  "title": "Метки смет и типовые проекты для расчёта дома",
  "mode": "interview",
  "depth": "normal",
  "tier": "T0",
  "briefFile": "2026-11-05-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Administrator/.agents/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-05T15:26:35+03:00",
  "updatedAt": "2026-11-05T15:44:57+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-05T15:26:35+03:00",
      "finishedAt": "2026-11-05T15:26:48+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-05T15:26:48+03:00",
      "finishedAt": "2026-11-05T15:27:41+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-05T15:27:41+03:00",
      "finishedAt": "2026-11-05T15:42:33+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-05T15:42:33+03:00",
      "finishedAt": "2026-11-05T15:44:54+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-05T15:44:54+03:00"
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
    "total": 21,
    "done": 0,
    "inTicket": 21,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Метки смет, AND-фильтр и типовые источники калькулятора",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09i",
        "R10i",
        "R11i",
        "G01",
        "G02",
        "G03",
        "G04",
        "G05",
        "G06",
        "G07",
        "G08",
        "G09",
        "G10"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "types.ts",
        "App.tsx",
        "contexts/EstimateSectionsContext.tsx",
        "contexts/EstimateContext.tsx",
        "hooks/useEstimateCrud.ts",
        "services/",
        "components/EstimateHistory.tsx",
        "components/EstimateEditor.tsx",
        "components/HouseCalculator.tsx",
        "components/EstimateSectionsSettings.tsx",
        "components/EstimateLabels*.tsx",
        "components/estimateEditorSignature.ts",
        "components/estimateEditorSignature.test.ts",
        "components/estimate-editor/EstimateMetaFields.tsx"
      ],
      "review": "нет — один T0 таск, независимое ревью всей ветки закрывает его целиком",
      "model": "сильная — общий persistence/merge-контракт и все пути источников калькулятора",
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
    "found": 2,
    "fixed": 2,
    "deferred": 0,
    "items": [
      "Контекст номерных ответов записан дословно в бриф; системная метка и наследование проверяемы. Остальное — прикладные уточнения R03/R04/R09i/R10i в пределах задачи."
    ]
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-05T15:26:35+03:00",
    "2026-11-05T15:26:48+03:00",
    "2026-11-05T15:27:40+03:00",
    "2026-11-05T15:27:41+03:00",
    "2026-11-05T15:28:55+03:00",
    "2026-11-05T15:33:46+03:00",
    "2026-11-05T15:34:33+03:00",
    "2026-11-05T15:37:18+03:00",
    "2026-11-05T15:42:33+03:00",
    "2026-11-05T15:44:53+03:00",
    "2026-11-05T15:44:54+03:00",
    "2026-11-05T15:44:55+03:00",
    "2026-11-05T15:44:56+03:00",
    "2026-11-05T15:44:57+03:00"
  ],
  "rev": 15,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-05T15:28:55+03:00",
      "to": "2026-11-05T15:33:46+03:00"
    },
    {
      "kind": "briefing",
      "from": "2026-11-05T15:34:33+03:00",
      "to": "2026-11-05T15:37:18+03:00"
    }
  ],
  "log": [
    {
      "t": "2026-11-05T15:26:35+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-05T15:26:48+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-05T15:27:41+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-05T15:28:55+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "Раунд 1: количество меток, фильтр текущих/архива, готовность типового проекта и остатки прошлого прогона"
    },
    {
      "t": "2026-11-05T15:33:46+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-05T15:34:33+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "Раунд 2: выбор меток фильтра, управление справочником, начальное назначение и наследование меток"
    },
    {
      "t": "2026-11-05T15:37:18+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-05T15:42:33+03:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 21,
      "total": 21
    },
    {
      "t": "2026-11-05T15:42:33+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-05T15:44:53+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 2,
      "fixed": 2,
      "deferred": 0
    },
    {
      "t": "2026-11-05T15:44:54+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-05T15:44:55+03:00",
      "k": "tier",
      "v": "T0"
    },
    {
      "t": "2026-11-05T15:44:56+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-05T15:44:57+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«во вкладке сметы текущий и архив, вот рядом нужно добавить ещё метка»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«раскрывающийся список»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«там будут сначала типовые проекты»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«и кнопка добавить можно будет разные добавлять туда»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«внутри другой сметы где есть клиент , тип постройки , туда нужно добавить ещё метку»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«в сметах при выборе метки будет как бы сортировка»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«расчет дома брать нужно будет только из типовых проектов»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«они у нас будут просчитаны»",
      "status": "in-ticket"
    },
    {
      "id": "R09i",
      "text": "(подразумевается) назначенная метка и добавленные метки сохраняются при повторном открытии",
      "status": "in-ticket"
    },
    {
      "id": "R10i",
      "text": "(подразумевается) отсутствие подходящих типовых проектов обрабатывается явно",
      "status": "in-ticket"
    },
    {
      "id": "R11i",
      "text": "(подразумевается) существующие сметы продолжают открываться без назначенной метки",
      "status": "in-ticket"
    },
    {
      "id": "G01",
      "text": "«1.несколько 2 метки может быть»",
      "status": "in-ticket"
    },
    {
      "id": "G02",
      "text": "«2.внутри текущих»",
      "status": "in-ticket"
    },
    {
      "id": "G03",
      "text": "«3.достаточно типовые проекты»",
      "status": "in-ticket"
    },
    {
      "id": "G04",
      "text": "«Можем несколько одновременно»",
      "status": "in-ticket"
    },
    {
      "id": "G05",
      "text": "«Две метки выбрал, он ищет и типовые проекты, и баня, где две метки также указаны»",
      "status": "in-ticket"
    },
    {
      "id": "G06",
      "text": "«нужно и переименование и удаление меток»",
      "status": "in-ticket"
    },
    {
      "id": "G07",
      "text": "«если он переименовывает метку, то где есть в других сметах эта метка, она тоже переименуется»",
      "status": "in-ticket"
    },
    {
      "id": "G08",
      "text": "«я зайду в смету и выберу метку для своих смет сам»",
      "status": "in-ticket"
    },
    {
      "id": "G09",
      "text": "«Да, старым сметам ничего не надо назначать»",
      "status": "in-ticket"
    },
    {
      "id": "G10",
      "text": "«Четвёртый вопрос, да, как ты написал, рекомендовано»",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-11-05T15:42:33+03:00",
      "open": 21,
      "total": 21
    },
    "G2": {
      "ok": true,
      "at": "2026-11-05T15:44:53+03:00",
      "found": 2,
      "fixed": 2,
      "deferred": 0
    },
    "G3": {
      "ok": true,
      "at": "2026-11-05T15:44:57+03:00",
      "problems": 0
    }
  },
  "result": null
}
