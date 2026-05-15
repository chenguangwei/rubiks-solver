import { useEffect } from 'react'
import type { Language } from './i18n'

const SITE_ORIGIN = 'https://rubikssolver.pro'
const HOME_URL = `${SITE_ORIGIN}/`
const ABOUT_URL = `${SITE_ORIGIN}/about`

export type SeoPage = 'home' | 'about'

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
    title: "What RubikSolver Can Do - Online Rubik's Cube Help",
    description:
      "Learn how RubikSolver helps beginners, learners, and speedcubers solve a 3x3 Rubik's Cube with scanning, validation, AI solving, 3D playback, and shareable practice links.",
    keywords:
      "RubikSolver features, Rubik's Cube help, learn Rubik's Cube online, 3x3 cube practice, cube solving guide",
  },
  zh: {
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    title: 'RubikSolver 能做什么 - 在线魔方求解帮助',
    description:
      '了解 RubikSolver 如何通过拍照录入、状态校验、AI 求解、3D 回放和可分享练习链接，帮助新手、学习者和玩家复原 3x3 魔方。',
    keywords:
      'RubikSolver 功能, 魔方求解帮助, 在线学魔方, 三阶魔方练习, 魔方复原指南',
  },
  ja: {
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    title: 'RubikSolver でできること - オンラインキューブ解法ヘルプ',
    description:
      'RubikSolver が撮影入力、状態検証、AI 解法、3D 再生、共有できる練習リンクで 3x3 キューブの解法を支援する方法を紹介します。',
    keywords:
      'RubikSolver 機能, ルービックキューブ ヘルプ, オンライン キューブ 学習, 3x3 練習',
  },
  ko: {
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    title: 'RubikSolver로 할 수 있는 일 - 온라인 큐브 풀이 도움말',
    description:
      'RubikSolver가 촬영 입력, 상태 검증, AI 풀이, 3D 재생, 공유 가능한 연습 링크로 3x3 큐브 풀이를 돕는 방법을 소개합니다.',
    keywords:
      'RubikSolver 기능, 큐브 풀이 도움말, 온라인 큐브 학습, 3x3 큐브 연습',
  },
  fr: {
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: "Ce que RubikSolver peut faire - Aide Rubik's Cube en ligne",
    description:
      "Découvrez comment RubikSolver aide à résoudre un Rubik's Cube 3x3 avec capture, validation, résolution IA, lecture 3D et liens de pratique partageables.",
    keywords:
      "fonctionnalités RubikSolver, aide Rubik's Cube, apprendre Rubik's Cube en ligne, entraînement cube 3x3",
  },
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

export function useSeoMetadata(language: Language, page: SeoPage = 'home') {
  useEffect(() => {
    const copy = page === 'about' ? ABOUT_SEO_COPY[language] : SEO_COPY[language]
    const url = page === 'about' ? ABOUT_URL : HOME_URL
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
