import { useEffect } from 'react'
import type { Language } from './i18n'

const SITE_URL = 'https://rubikssolver.pro/'

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

export function useSeoMetadata(language: Language) {
  useEffect(() => {
    const copy = SEO_COPY[language]
    document.documentElement.lang = copy.htmlLang
    document.title = copy.title

    upsertCanonical(SITE_URL)
    upsertMeta('name', 'description', copy.description)
    upsertMeta('name', 'keywords', copy.keywords)
    upsertMeta('property', 'og:title', copy.title)
    upsertMeta('property', 'og:description', copy.description)
    upsertMeta('property', 'og:url', SITE_URL)
    upsertMeta('property', 'og:locale', copy.ogLocale)
    upsertMeta('name', 'twitter:title', copy.title)
    upsertMeta('name', 'twitter:description', copy.description)
  }, [language])
}
