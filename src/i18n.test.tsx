import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { I18nProvider, useI18n } from './i18n'

function setBrowserLanguages(languages: readonly string[]) {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: languages,
  })
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: languages[0],
  })
}

function Probe({ children }: { children?: ReactNode }) {
  const { language, setLanguage, t } = useI18n()
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="label">{t('tabs.scan')}</span>
      <button onClick={() => setLanguage('en')}>English</button>
      {children}
    </div>
  )
}

describe('I18nProvider', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    })
  })

  it('uses the browser language on first load', () => {
    setBrowserLanguages(['zh-CN', 'en-US'])

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )

    expect(screen.getByTestId('language')).toHaveTextContent('zh')
    expect(screen.getByTestId('label')).toHaveTextContent('魔方求解')
    expect(document.documentElement.lang).toBe('zh-Hans')
  })

  it('ignores legacy stored language unless it was explicitly selected', () => {
    window.localStorage.setItem('rubiks-solver:language', 'en')
    setBrowserLanguages(['zh-CN', 'en-US'])

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )

    expect(screen.getByTestId('language')).toHaveTextContent('zh')
  })

  it('preserves explicit language selection across loads', () => {
    window.localStorage.setItem('rubiks-solver:language', 'en')
    window.localStorage.setItem('rubiks-solver:language-source', 'manual')
    setBrowserLanguages(['zh-CN', 'en-US'])

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    )

    expect(screen.getByTestId('language')).toHaveTextContent('en')
    expect(screen.getByTestId('label')).toHaveTextContent('Cube Solver')
    expect(document.documentElement.lang).toBe('en')
  })
})
