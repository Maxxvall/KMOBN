window.STATE =
{
  "version": 2,
  "slug": "audit-fixes-ux",
  "dir": "2026-11-13-audit-fixes-ux--wip",
  "title": "Исправления дельта-аудита и UX больших экранов",
  "mode": "semi",
  "depth": "normal",
  "tier": null,
  "briefFile": "2026-11-13-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/Administrator/.agents/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-13T22:29:06+03:00",
  "updatedAt": "2026-11-13T22:54:00+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-13T22:29:06+03:00",
      "finishedAt": "2026-11-13T22:29:35+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-13T22:29:35+03:00",
      "finishedAt": "2026-11-13T22:31:23+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-13T22:31:23+03:00",
      "finishedAt": "2026-11-13T22:38:28+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-13T22:38:28+03:00",
      "finishedAt": "2026-11-13T22:46:55+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-13T22:46:55+03:00"
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
    "total": 34,
    "done": 0,
    "inTicket": 32,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 2,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Починка находок аудита и UX больших экранов",
      "requirements": [
        "R01",
        "R01.1",
        "R02",
        "R02.1",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09",
        "R10",
        "R11",
        "R11.1",
        "R12",
        "R13",
        "R14",
        "R15",
        "R16",
        "R17",
        "R18",
        "R19",
        "R20",
        "R21",
        "R22",
        "R22.1",
        "R23",
        "R23.1",
        "R24",
        "R25",
        "R26",
        "R27",
        "R28",
        "R29",
        "R30",
        "R31",
        "R34i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "App.tsx",
        "components/",
        "services/",
        "hooks/",
        "electron/",
        "types.ts",
        "tailwind.config.js",
        "styles.css"
      ],
      "review": "нет (ревью всей ветки в конце — T0)",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    }
  ],
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [
      "R11: кровельный коэффициент унифицирован по типу кровли из houseCalculator (0.95/1.0/1.15/1.25), фолбэк 1.15 — решение принято за пользователя (брифинг без ответа)",
      "U4: редактор смет — только ограничение ширины и плотность, без 2-колоночной перестройки принятого редизайна"
    ],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 3,
    "fixed": 1,
    "deferred": 2,
    "items": [
      "R32/R33 (монолиты, @ts-nocheck) — вне рамок: договорённость «дальний рефакторинг — отдельная работа», вопрос задан на брифинге без ответа; вернётся в отчёт «что не вошло»",
      "ссылки на брифинг без ответа (R32/R33/U4/R11) — по построению: ответы пользователя отсутствуют, решения записаны как ASSUMPTION в манифесте, не в бриф"
    ]
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-13T22:29:06+03:00",
    "2026-11-13T22:29:35+03:00",
    "2026-11-13T22:31:12+03:00",
    "2026-11-13T22:31:23+03:00",
    "2026-11-13T22:31:54+03:00",
    "2026-11-13T22:38:18+03:00",
    "2026-11-13T22:38:21+03:00",
    "2026-11-13T22:38:25+03:00",
    "2026-11-13T22:38:28+03:00",
    "2026-11-13T22:46:45+03:00",
    "2026-11-13T22:46:55+03:00",
    "2026-11-13T22:53:56+03:00",
    "2026-11-13T22:54:00+03:00"
  ],
  "rev": 14,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-13T22:31:54+03:00",
      "to": "2026-11-13T22:38:18+03:00"
    }
  ],
  "log": [
    {
      "t": "2026-11-13T22:29:06+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-13T22:29:35+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-13T22:31:23+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-13T22:31:54+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "4 вопроса: монолиты в прогон?, кровельный коэффициент, прошлые мелкие баги, редактор на больших экранах"
    },
    {
      "t": "2026-11-13T22:38:18+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-13T22:38:21+03:00",
      "k": "add",
      "key": "debt.assumptions",
      "n": 1
    },
    {
      "t": "2026-11-13T22:38:25+03:00",
      "k": "add",
      "key": "debt.assumptions",
      "n": 1
    },
    {
      "t": "2026-11-13T22:38:28+03:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 32,
      "total": 34
    },
    {
      "t": "2026-11-13T22:38:28+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-13T22:46:45+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 3,
      "fixed": 1,
      "deferred": 2
    },
    {
      "t": "2026-11-13T22:46:55+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-13T22:53:56+03:00",
      "k": "tickets",
      "n": 1
    },
    {
      "t": "2026-11-13T22:54:00+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«Сохранение сметы молча стирает все пользовательские метки, если справочник меток не загружен» — P1",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«Импорт бэкапа, сделанного до введения меток (v1.9.0), стирает метки у совпавших смет» — P2",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«Незакоммиченный WIP: services/format.ts не в git, но импортируется изменёнными файлами. Коммитить одним куском»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«onDismiss баннера обновления сбрасывает downloading при продолжающейся загрузке» — P2",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«Путь загрузки справочника меток не проверяет принадлежность документа аккаунту» — P2",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«Гонка persistSectionsDocument с синхронизацией» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«Конфликт меток: „Оставить этот вариант\" молча удаляет переименованную метку tombstone'ом другой стороны» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«ProfileModal позволяет нажать „Скачать обновление\" параллельно с уже идущей загрузкой» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R09",
      "text": "«houseCalculator.ts:559 — „использована ближайший типовой проект\" (опечатка, рода не согласованы)» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R10",
      "text": "«fallback-пул типовых проектов не фильтрует isFrameHouse: если все „типовые\" сметы — бани, расчёт дома посчитается от бани» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R11",
      "text": "«Коэффициент кровли — 3 расходящихся источника... AI и визард дают разное количество материала на одних данных» — P2",
      "status": "in-ticket"
    },
    {
      "id": "R12",
      "text": "«Нормализация ё→е — не унифицирована... один хелпер + включить ё→е в normalizeKey» — P2",
      "status": "in-ticket"
    },
    {
      "id": "R13",
      "text": "«Санитайзер имён файлов: 3 копии + один путь вообще без санитизации» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R14",
      "text": "«Мёртвая props-ветка EstimateEditor осталась... 17 опциональных пропсов» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R15",
      "text": "«Иероглифы в wikiDatabase.ts:653 („每一个\")» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R16",
      "text": "«onKeyPress ×10 (Bundles/Works/Prices — deprecated)» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R17",
      "text": "«key={idx} ×5» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R18",
      "text": "«console. 46 в проде (было 90)» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R19",
      "text": "«синхронный fs.appendFileSync в electron main (electron/main.ts:34)» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R20",
      "text": "«formatDuration локальный в ProfileModal (перенести в services/format.ts рядом с formatBytes)» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R21",
      "text": "«pdfGenerator2.ts — 8-строчный алиас legacy-слоя, именование PDF-генераторов запутано» — P3",
      "status": "in-ticket"
    },
    {
      "id": "R22",
      "text": "«max-w-8xl не существует в Tailwind 3.4... глобальное ограничение ширины не работает» (U1)",
      "status": "in-ticket"
    },
    {
      "id": "R23",
      "text": "«Sticky-шапка и заголовки таблиц... при работе с длинной сметой навигация и колонки исчезают» (U2)",
      "status": "in-ticket"
    },
    {
      "id": "R24",
      "text": "«Полная горизонтальная навигация на xl+ — сейчас 6 из 9 разделов спрятаны в мобильный drawer» (U3)",
      "status": "in-ticket"
    },
    {
      "id": "R25",
      "text": "«EstimateEditor — главный экран без ограничения ширины... на 2560px имя-колонка ~800px» (U4)",
      "status": "in-ticket"
    },
    {
      "id": "R26",
      "text": "«Формы добавления Prices/Works/Bundles — вертикальные стеки полноширинных инпутов... один ряд» (U5)",
      "status": "in-ticket"
    },
    {
      "id": "R27",
      "text": "«Карточные списки в 1 колонку на всю ширину (Bundles, SheetRoomPlanner) → сетки» (U6)",
      "status": "in-ticket"
    },
    {
      "id": "R28",
      "text": "«Analytics: фиксированная высота окна виртуализации и графиков... узкая щель в пустом экране» (U7)",
      "status": "in-ticket"
    },
    {
      "id": "R29",
      "text": "«EstimateHistory: снять truncate-лимиты (240/180px) на xl, 5 текстовых кнопок → иконки» (U8)",
      "status": "in-ticket"
    },
    {
      "id": "R30",
      "text": "«SmartEstimateWizard (главный вход создания сметы) — 5 шагов в узкой колонке → max-w-3xl со степпером сбоку» (U9)",
      "status": "in-ticket"
    },
    {
      "id": "R31",
      "text": "«Breakpoint 3xl: 1920px + бамп text-xs→text-sm — закрывает „плоскую зону\"» (U10)",
      "status": "in-ticket"
    },
    {
      "id": "R32",
      "text": "«Монолиты не разбиты — EstimateEditor 2340, App 2294, Analytics 2095, openRouter 1784; Prices↔Works дублируют ~2/3; общий Modal не заведён»",
      "status": "deferred",
      "why": "аудит, находка 10 — заявленный долг; PROGRESS: «дальний рефакторинг — отдельная работа» (договорённость прошлых сборок); предложено не брать, ответа на брифинге нет → вне рамок, вернётся в отчёт «что не вошло»"
    },
    {
      "id": "R33",
      "text": "«@ts-nocheck ×2 (pdfGenerator.ts:1, pdfContractGenerator.ts:1)»",
      "status": "deferred",
      "why": "часть долга находки 10; та же причина — вне рамок этого прогона"
    },
    {
      "id": "R34i",
      "text": "(подразумевается) после правок npm run check зелёный (тесты/типы/линт); поведение смет, синка и расчётов не сломано",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-11-13T22:38:28+03:00",
      "open": 32,
      "total": 34
    },
    "G2": {
      "ok": true,
      "at": "2026-11-13T22:46:45+03:00",
      "found": 3,
      "fixed": 1,
      "deferred": 2
    },
    "G3": {
      "ok": true,
      "at": "2026-11-13T22:54:00+03:00",
      "problems": 0
    }
  },
  "result": null
}
