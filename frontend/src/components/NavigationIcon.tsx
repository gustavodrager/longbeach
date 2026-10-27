type IconName = 'home' | 'calendar' | 'school' | 'people' | 'wallet' | 'box' | 'project' | 'tools' | 'bar' | 'orders' | 'stock' | 'check' | 'download' | 'upload' | 'plus' | 'menu'

const paths: Record<IconName, string> = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 4h3',
  school: 'm2 8 10-5 10 5-10 5Zm4 3v6c4 3 8 3 12 0v-6m4-3v9',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M13 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4m2 0a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5m18 7h-5v5h5m-3-2.5h.01',
  box: 'm3 7 9-4 9 4-9 4Zm0 0v10l9 4 9-4V7M12 11v10M7 5l9 4',
  project: 'M3 4h18v16H3Zm6 0v16m6-16v16M5 8h2m4 0h2m4 0h2M5 12h2m4 0h2',
  tools: 'M14 4a6 6 0 0 0-7 7L3 15a3 3 0 0 0 4 4l4-4a6 6 0 0 0 7-7l-4 4-4-4Z',
  bar: 'M5 3h14l-1 8a6 6 0 0 1-12 0Zm7 14v4m-4 0h8M6 8h12',
  orders: 'M7 4h13v17H4V4h3Zm1-2h8v4H8Zm0 8h8m-8 4h8m-8 4h5',
  stock: 'M3 3v18h18M6 16l4-4 4 2 6-7m-4 0h4v4',
  check: 'm5 12 4 4L19 6M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 6h16M4 12h16M4 18h16',
}

export function NavigationIcon({ name }: { name: IconName }) {
  return <svg className="navigation-icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

export type { IconName }
