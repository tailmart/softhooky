import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface SiteConfig {
  logo_url: string
  icon_url: string
  site_title: string
  oauth_platforms?: string[]
}

interface SiteConfigContextType {
  config: SiteConfig
  loading: boolean
}

const defaultConfig: SiteConfig = {
  logo_url: '/logo.png',
  icon_url: '/logo.png',
  site_title: 'Softhooky-智能设计平台'
}

const SiteConfigContext = createContext<SiteConfigContextType>({
  config: defaultConfig,
  loading: true
})

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(defaultConfig)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/site-config')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setConfig(d.data)
          // 动态更新 favicon
          const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
          if (link && d.data.icon_url) {
            link.href = d.data.icon_url
          }
          // 动态更新标题
          if (d.data.site_title) {
            document.title = d.data.site_title
          }
        }
      })
      .catch(() => {
        // 使用默认配置
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <SiteConfigContext.Provider value={{ config, loading }}>
      {children}
    </SiteConfigContext.Provider>
  )
}

export function useSiteConfig() {
  return useContext(SiteConfigContext)
}
