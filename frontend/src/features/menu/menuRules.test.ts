import { expect, it } from 'vitest'
import { approvedMenuTemplate, createStarterMenu } from './menuTemplate'
import { resolveMenuPreview } from './menuTypes'
it('preserva o conteúdo aprovado e as correções finais de preço', () => {
  const items = approvedMenuTemplate.flatMap(p => p.items)
  expect(items).toHaveLength(32)
  expect(items.find(i => i.name === 'Porção de queijo provolone')?.expectedPrice).toBe(25)
  expect(items.find(i => i.name === 'Porção de salame')?.expectedPrice).toBe(20)
  expect(items.find(i => i.name === 'Xeque Mate')).toMatchObject({ expectedPrice: 18.5 })
  expect(approvedMenuTemplate[0].items.every(i => !i.description)).toBe(true)
  expect(items.filter(i => i.description).map(i => i.description)).toEqual(['600 ml', '600 ml', 'Amstel Ultra • Michelob Ultra • Heineken Zero'])
})
it('vincula apenas aliases exatos e exclui opções não aprovadas', () => {
  const products = ['Amstel Ultra Longneck','Michelob Ultra Longneck','Heineken Zero Longneck','Stella Artois Longneck','Draft Red Line 600ml','Mascate Melancia e Framboesa','Caipirinha Smirnoff'].map((name,id) => ({ id:String(id),name,salePrice:15,active:true }))
  const menu = createStarterMenu(products)
  const longneck = menu.pages.flatMap(p => p.items).find(i => i.id === 'longneck')!
  expect(longneck.productIds).toEqual(['0','1','2'])
  expect(menu.pages.flatMap(p => p.items).flatMap(i => i.productIds)).not.toContain('6')
})
it('agrupamento divergente não produz preço de prévia válido', () => {
  const menu = createStarterMenu([])
  menu.pages = [{ ...menu.pages[0], items: [{ ...menu.pages[0].items[0], productIds: ['a','b'] }] }]
  const result = resolveMenuPreview(menu,[{id:'a',name:'Água A',salePrice:5,active:true},{id:'b',name:'Água B',salePrice:8,active:true}])
  expect(result.pages).toHaveLength(0)
  expect(result.issues.join(' ')).toContain('preços diferentes')
})
