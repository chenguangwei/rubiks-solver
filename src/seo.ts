import { useEffect } from 'react'
import type { Language } from './i18n'
import { getPuzzleDefinition } from './puzzles/catalog'
import type { PuzzleId } from './puzzles/types'

const SITE_ORIGIN = 'https://rubikssolver.pro'
const HOME_URL = `${SITE_ORIGIN}/`
const ABOUT_URL = `${SITE_ORIGIN}/about`

export type SeoPage = 'about' | PuzzleId

type SeoCopy = {
  htmlLang: string
  ogLocale: string
  title: string
  description: string
  keywords: string
}

const SEO_COPY: Record<Language, SeoCopy> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    title: "RubikSolver - Online 3x3 Rubik's Cube Solver",
    description:
      "Solve a 3x3 Rubik's Cube online with editable cube net input, image import, validation, Kociemba solving, 3D preview, and step-by-step playback.",
    keywords:
      "Rubik's Cube solver, 3x3 cube solver, online cube solver, Kociemba solver, cube algorithm, RubikSolver",
  },
  zh: {
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    title: 'RubikSolver - 在线 3x3 魔方求解器',
    description:
      '在线求解 3x3 魔方，支持展开图编辑、图片导入、状态校验、Kociemba 求解、3D 预览和逐步回放。',
    keywords:
      '魔方求解器, 三阶魔方求解器, 在线魔方求解, 3x3 魔方, Kociemba 求解, RubikSolver',
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    title: 'RubikSolver - オンライン 3x3 ルービックキューブソルバー',
    description:
      '3x3 ルービックキューブをオンラインで解けます。展開図編集、画像インポート、状態検証、Kociemba 解法、3D プレビュー、手順再生に対応しています。',
    keywords:
      'ルービックキューブ ソルバー, 3x3 キューブ ソルバー, オンライン キューブ 解法, Kociemba, RubikSolver',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title: 'RubikSolver - 온라인 3x3 큐브 솔버',
    description:
      '3x3 큐브를 온라인에서 풉니다. 전개도 편집, 이미지 가져오기, 상태 검증, Kociemba 풀이, 3D 미리보기, 단계별 재생을 지원합니다.',
    keywords:
      '큐브 솔버, 3x3 큐브 풀이, 온라인 큐브 솔버, Kociemba, 루빅스 큐브, RubikSolver',
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: 'RubikSolver - Solveur de Rubik 3x3 en ligne',
    description:
      "Résolvez un Rubik's Cube 3x3 en ligne avec saisie par patron, import d'image, validation, solveur Kociemba, aperçu 3D et lecture étape par étape.",
    keywords:
      "solveur Rubik's Cube, solveur cube 3x3, solveur en ligne, Kociemba, algorithme Rubik, RubikSolver",
  },
}

const ABOUT_SEO_COPY: Record<Language, SeoCopy> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    title: 'What RubikSolver Can Do - Online Cube Solver Help',
    description:
      'Learn how RubikSolver supports 2x2, 3x3, 4x4, 5x5, Pyraminx, and Skewb with puzzle-specific guides, solving flows, notation, and playback.',
    keywords:
      "RubikSolver features, cube solver help, 2x2 guide, 3x3 guide, 4x4 guide, 5x5 guide, Pyraminx guide, Skewb guide",
  },
  zh: {
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    title: 'RubikSolver 能做什么 - 在线多类型魔方求解帮助',
    description:
      '了解 RubikSolver 如何覆盖 2x2、3x3、4x4、5x5、金字塔和 Skewb，并提供独立指南、求解流程、记号说明和步骤播放。',
    keywords:
      'RubikSolver 功能, 多类型魔方求解帮助, 2x2 指南, 3x3 指南, 4x4 指南, 5x5 指南, 金字塔指南, Skewb 指南',
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    title: 'RubikSolver でできること - オンラインキューブ解法ヘルプ',
    description:
      'RubikSolver が 2x2、3x3、4x4、5x5、Pyraminx、Skewb を種類別ガイド、記法、再生で支援する方法を紹介します。',
    keywords:
      'RubikSolver 機能, キューブ 解法 ヘルプ, 2x2 ガイド, 3x3 ガイド, 4x4 ガイド, Pyraminx, Skewb',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title: 'RubikSolver로 할 수 있는 일 - 온라인 큐브 풀이 도움말',
    description:
      'RubikSolver가 2x2, 3x3, 4x4, 5x5, Pyraminx, Skewb를 퍼즐별 가이드, 표기법, 풀이 흐름, 재생으로 지원하는 방법을 소개합니다.',
    keywords:
      'RubikSolver 기능, 큐브 풀이 도움말, 2x2 가이드, 3x3 가이드, 4x4 가이드, Pyraminx, Skewb',
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: "Ce que RubikSolver peut faire - Aide Rubik's Cube en ligne",
    description:
      "Découvrez comment RubikSolver prend en charge 2x2, 3x3, 4x4, 5x5, Pyraminx et Skewb avec guides, notations, flux de résolution et lecture adaptés.",
    keywords:
      "fonctionnalités RubikSolver, aide cube en ligne, guide 2x2, guide 3x3, guide 4x4, guide 5x5, Pyraminx, Skewb",
  },
}

const MINI_CUBE_SEO_COPY: Record<Language, SeoCopy> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    title: 'Mini Cube Solver 2x2x2 - Online 2x2 Cube Solver',
    description:
      'Solve legal 2x2 mini cube scrambles online with a browser-based solver, local verification, and a clear move sequence.',
    keywords:
      '2x2 cube solver, mini cube solver, 2x2x2 solver, online 2x2 solver, pocket cube solver',
  },
  zh: {
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    title: 'Mini Cube Solver 2x2x2 - 在线 2x2 迷你魔方求解器',
    description:
      '在线求解合法 2x2 迷你魔方打乱状态，在浏览器中生成解法、校验结果，并展示清晰步骤。',
    keywords: '2x2 魔方求解器, 迷你魔方求解器, 2x2x2 求解器, 在线 2x2 魔方',
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    title: 'Mini Cube Solver 2x2x2 - オンライン 2x2 キューブソルバー',
    description:
      '合法な 2x2 ミニキューブのスクランブルをブラウザ内で解き、解法と検証済みの手順を表示します。',
    keywords: '2x2 キューブ ソルバー, ミニキューブ ソルバー, 2x2x2 ソルバー',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title: 'Mini Cube Solver 2x2x2 - 온라인 2x2 큐브 풀이',
    description:
      '합법적인 2x2 미니 큐브 스크램블을 브라우저에서 풀고, 검증된 해법 순서를 확인합니다.',
    keywords: '2x2 큐브 풀이, 미니 큐브 솔버, 2x2x2 솔버, 온라인 2x2 큐브',
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: 'Mini Cube Solver 2x2x2 - Solveur 2x2 en ligne',
    description:
      'Résolvez des mélanges valides de mini cube 2x2 dans le navigateur avec vérification locale et séquence de mouvements claire.',
    keywords: 'solveur 2x2, mini cube solver, solveur 2x2x2, cube 2x2 en ligne',
  },
}

const REVENGE_CUBE_SEO_COPY: Record<Language, SeoCopy> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    title: "Rubik's Revenge Solver 4x4x4 - Online 4x4 Cube Solver",
    description:
      'Practice legal 4x4 cube scrambles online with 3D preview, wide moves, photo capture, verified reverse playback, and a clear move route.',
    keywords:
      "4x4 cube solver, Rubik's Revenge solver, 4x4x4 solver, online 4x4 solver, big cube solver",
  },
  zh: {
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    title: "Rubik's Revenge Solver 4x4x4 - 在线 4x4 魔方求解器",
    description:
      '在线练习合法 4x4 魔方打乱，支持 3D 预览、宽层转动、拍照录入、验证回放和清晰步骤。',
    keywords: '4x4 魔方求解器, 四阶魔方求解器, 4x4x4 求解器, 在线 4x4 魔方',
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    title: "Rubik's Revenge Solver 4x4x4 - オンライン 4x4 キューブソルバー",
    description:
      '合法な 4x4 キューブのスクランブルをブラウザで練習し、3D プレビュー、ワイドムーブ、撮影入力、検証済み再生を使えます。',
    keywords: '4x4 キューブ ソルバー, 4x4x4 ソルバー, Rubik Revenge ソルバー',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title: "Rubik's Revenge Solver 4x4x4 - 온라인 4x4 큐브 풀이",
    description:
      '합법적인 4x4 큐브 스크램블을 브라우저에서 연습하고 3D 미리보기, 와이드 무브, 촬영 입력, 검증된 재생을 확인합니다.',
    keywords: '4x4 큐브 풀이, 4x4x4 솔버, 온라인 4x4 큐브',
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: "Rubik's Revenge Solver 4x4x4 - Solveur 4x4 en ligne",
    description:
      'Entraînez-vous sur des mélanges valides de cube 4x4 avec aperçu 3D, mouvements larges, capture photo, lecture vérifiée et route claire.',
    keywords: 'solveur 4x4, solveur Rubik Revenge, solveur 4x4x4, cube 4x4 en ligne',
  },
}

const PROFESSOR_CUBE_SEO_COPY: Record<Language, SeoCopy> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    title: "Professor's Cube Solver 5x5x5 - Online 5x5 Practice Solver",
    description:
      "Practice legal 5x5 Professor's Cube scrambles online with verified reverse playback for generated scrambles and manual move history.",
    keywords:
      "5x5 cube solver, Professor's Cube solver, 5x5x5 solver, online 5x5 practice, big cube solver",
  },
  zh: {
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    title: "Professor's Cube Solver 5x5x5 - 在线 5x5 魔方练习求解器",
    description:
      '在线练习合法 5x5 五阶魔方打乱，并对生成打乱和手动历史提供已验证的反向回放路线。',
    keywords: '5x5 魔方求解器, 五阶魔方求解器, 5x5x5 求解器, 在线 5x5 魔方练习',
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    title: "Professor's Cube Solver 5x5x5 - オンライン 5x5 練習ソルバー",
    description:
      '合法な 5x5 キューブのスクランブルを練習し、生成スクランブルと手動履歴の検証済み逆再生を表示します。',
    keywords: '5x5 キューブ ソルバー, 5x5x5 ソルバー, Professor Cube ソルバー',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title: "Professor's Cube Solver 5x5x5 - 온라인 5x5 연습 풀이",
    description:
      '합법적인 5x5 큐브 스크램블을 연습하고 생성된 스크램블과 수동 기록의 검증된 역재생 경로를 확인합니다.',
    keywords: '5x5 큐브 풀이, 5x5x5 솔버, 프로페서 큐브 솔버',
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: "Professor's Cube Solver 5x5x5 - Solveur d'entraînement 5x5",
    description:
      "Entraînez-vous sur des mélanges valides de Professor's Cube 5x5 avec lecture inverse vérifiée pour les mélanges générés et l'historique manuel.",
    keywords: 'solveur 5x5, solveur Professor Cube, solveur 5x5x5, entraînement cube 5x5',
  },
}

const PYRAMINX_SEO_COPY: Record<Language, SeoCopy> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    title: 'Pyraminx Solver - Online Pyraminx Solution Player',
    description:
      'Solve generated Pyraminx scrambles online with a client-side solver, verified move playback, and puzzle-specific notation.',
    keywords: 'Pyraminx solver, online Pyraminx solver, Pyraminx solution, WCA Pyraminx',
  },
  zh: {
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    title: 'Pyraminx Solver - 在线金字塔魔方求解器',
    description:
      '在线求解金字塔魔方打乱，使用浏览器本地求解、验证回放和专属记号说明。',
    keywords: '金字塔魔方求解器, Pyraminx 求解器, 在线金字塔魔方',
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    title: 'Pyraminx Solver - オンライン ピラミンクス ソルバー',
    description:
      'ピラミンクスのスクランブルをブラウザ内で解き、検証済みの手順と専用記法を表示します。',
    keywords: 'Pyraminx ソルバー, ピラミンクス 解法, オンライン Pyraminx',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title: 'Pyraminx Solver - 온라인 피라밍크스 풀이',
    description:
      '피라밍크스 스크램블을 브라우저에서 풀고 검증된 수순과 퍼즐 전용 표기법을 확인합니다.',
    keywords: '피라밍크스 풀이, Pyraminx solver, 온라인 피라밍크스',
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: 'Pyraminx Solver - Solveur Pyraminx en ligne',
    description:
      'Résolvez des mélanges Pyraminx dans le navigateur avec lecture vérifiée et notation adaptée au puzzle.',
    keywords: 'solveur Pyraminx, Pyraminx en ligne, solution Pyraminx',
  },
}

const SKEWB_SEO_COPY: Record<Language, SeoCopy> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    title: 'Skewb Solver - Online Skewb Solution Player',
    description:
      'Solve generated Skewb scrambles online with a client-side solver, verified move playback, and Skewb-specific notation.',
    keywords: 'Skewb solver, online Skewb solver, Skewb solution, WCA Skewb',
  },
  zh: {
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    title: 'Skewb Solver - 在线斜转魔方求解器',
    description:
      '在线求解 Skewb 斜转魔方打乱，使用浏览器本地求解、验证回放和专属记号说明。',
    keywords: 'Skewb 求解器, 斜转魔方求解器, 在线 Skewb 魔方',
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    title: 'Skewb Solver - オンライン スキューブ ソルバー',
    description:
      'スキューブのスクランブルをブラウザ内で解き、検証済みの手順と専用記法を表示します。',
    keywords: 'Skewb ソルバー, スキューブ 解法, オンライン Skewb',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title: 'Skewb Solver - 온라인 스큐브 풀이',
    description:
      '스큐브 스크램블을 브라우저에서 풀고 검증된 수순과 퍼즐 전용 표기법을 확인합니다.',
    keywords: '스큐브 풀이, Skewb solver, 온라인 스큐브',
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: 'Skewb Solver - Solveur Skewb en ligne',
    description:
      'Résolvez des mélanges Skewb dans le navigateur avec lecture vérifiée et notation adaptée au Skewb.',
    keywords: 'solveur Skewb, Skewb en ligne, solution Skewb',
  },
}

const PUZZLE_SEO_COPY: Record<PuzzleId, Record<Language, SeoCopy>> = {
  '222': MINI_CUBE_SEO_COPY,
  '333': SEO_COPY,
  '444': REVENGE_CUBE_SEO_COPY,
  '555': PROFESSOR_CUBE_SEO_COPY,
  pyraminx: PYRAMINX_SEO_COPY,
  skewb: SKEWB_SEO_COPY,
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.content = content
}

function upsertCanonical(url: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.appendChild(element)
  }
  element.href = url
}

function canonicalUrlForPage(page: SeoPage): string {
  if (page === 'about') return ABOUT_URL
  const route = getPuzzleDefinition(page).route
  return route === '/' ? HOME_URL : `${SITE_ORIGIN}${route}`
}

export function useSeoMetadata(language: Language, page: SeoPage = '333') {
  useEffect(() => {
    const copy = page === 'about' ? ABOUT_SEO_COPY[language] : PUZZLE_SEO_COPY[page][language]
    const url = canonicalUrlForPage(page)
    document.documentElement.lang = copy.htmlLang
    document.title = copy.title

    upsertCanonical(url)
    upsertMeta('name', 'description', copy.description)
    upsertMeta('name', 'keywords', copy.keywords)
    upsertMeta('property', 'og:title', copy.title)
    upsertMeta('property', 'og:description', copy.description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:locale', copy.ogLocale)
    upsertMeta('name', 'twitter:title', copy.title)
    upsertMeta('name', 'twitter:description', copy.description)
  }, [language, page])
}
