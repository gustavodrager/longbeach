import type { MenuCatalogProduct, MenuDocument } from './menuTypes'

type TemplateItem = { id: string; name: string; description?: string; expectedPrice: number; aliases: string[] }
type TemplatePage = { id: string; title: string; items: TemplateItem[] }

export const approvedMenuTemplate: TemplatePage[] = [
  { id: 'sem-alcool', title: 'Sem álcool', items: [
    { id: 'agua', name: 'Água', expectedPrice: 5, aliases: ['Água', 'Água 500 ml', 'Água sem gás 500 ml', 'Água com gás', 'Água com gás 500 ml'] },
    { id: 'refrigerantes', name: 'Refrigerantes', expectedPrice: 8, aliases: ['Coca-Cola', 'Coca-Cola Zero', 'Coca-Cola 350 ml', 'Coca-Cola Zero 350 ml', 'Coca-Cola Zero lata 350 ml', 'Guaraná', 'Guaraná Zero', 'Guaraná Antártica', 'Guaraná Antártica Zero', 'Schweppes', 'Schweppes 350 ml', 'Sprite Fresh Limão 510 ml'] },
    { id: 'sucos', name: 'Sucos', expectedPrice: 8, aliases: ['Del Valle', 'Del Valle Uva', 'Del Valle Limonada', 'Del Valle Limonada Pink', 'Del Valle Manga', 'Del Valle Pêssego', 'Suco Uva lata 290 ml'] },
    { id: 'guaraviton-isotonico', name: 'Guaraviton e Isotônico', expectedPrice: 8, aliases: ['Guaraviton', 'Guaraviton Açaí', 'Powerade', 'Powerade Uva', 'Powerade Limão', 'Powerade Azul', 'Powerade Frutas Tropicais 500 ml', 'Powerade Mountain Blast Zero 500 ml', 'Powerade Tangerina 500 ml', 'Powerade Uva 500 ml'] },
    { id: 'proteina', name: 'Proteína pronta', expectedPrice: 15, aliases: ['Proteína pronta', 'Pro Force', 'Pro Force 15 g de proteínas', 'Pro Force 15g Proteínas'] },
    { id: 'energeticos', name: 'Energéticos', expectedPrice: 15, aliases: ['Monster', 'Monster Tradicional', 'Monster Zero', 'Monster Absolutly Zero', 'Monster Mango Loco', 'Monster Rio Punch', 'Monster Tradicional Zero', 'Monster Ultra Zero', 'Red Bull', 'Red Bull Tradicional', 'Red Bull Zero', 'Red Bull Melancia', 'Red Bull Tropical'] },
  ] },
  { id: 'petiscos', title: 'Porções e petiscos', items: [
    { id: 'batata-frita', name: 'Porção de batata frita', expectedPrice: 20, aliases: ['Porção de batata frita', 'Batata frita'] },
    { id: 'azeitona', name: 'Porção de azeitona', expectedPrice: 15, aliases: ['Porção de azeitona', 'Azeitona'] },
    { id: 'provolone', name: 'Porção de queijo provolone', expectedPrice: 25, aliases: ['Porção de queijo provolone', 'Queijo provolone', 'Provolone'] },
    { id: 'salame', name: 'Porção de salame', expectedPrice: 20, aliases: ['Porção de salame', 'Salame'] },
    { id: 'amendoins', name: 'Amendoins', expectedPrice: 9, aliases: ['Amendoins', 'Amendoim'] },
    { id: 'batata-chips', name: 'Batata chips', expectedPrice: 8, aliases: ['Batata chips', 'Batatas chips'] },
  ] },
  { id: 'cervejas-drinks', title: 'Cervejas, drinks e doses', items: [
    { id: 'amstel', name: 'Amstel', description: '600 ml', expectedPrice: 18, aliases: ['Amstel 600 ml', 'Amstel 600ml'] },
    { id: 'heineken', name: 'Heineken', description: '600 ml', expectedPrice: 20, aliases: ['Heineken 600 ml', 'Heineken 600ml'] },
    { id: 'longneck', name: 'Longneck', description: 'Amstel Ultra • Michelob Ultra • Heineken Zero', expectedPrice: 15, aliases: ['Amstel Ultra', 'Amstel Ultra Longneck', 'Michelob Ultra', 'Michelob Ultra Longneck', 'Heineken Zero', 'Heineken Zero Longneck'] },
    { id: 'caipirinha', name: 'Caipirinha', expectedPrice: 25, aliases: ['Caipirinha', 'Caipirinha Velho Barreiro'] },
    { id: 'caipiroska', name: 'Caipiroska', expectedPrice: 30, aliases: ['Caipiroska'] },
    { id: 'caipirinha-absolut', name: 'Caipirinha Absolut', expectedPrice: 40, aliases: ['Caipirinha Absolut'] },
    { id: 'gin', name: 'Dose Gin', expectedPrice: 30, aliases: ['Dose Gin'] },
    { id: 'whisky', name: 'Dose Whisky', expectedPrice: 30, aliases: ['Dose Whisky'] },
    { id: 'vodka', name: 'Dose Vodka', expectedPrice: 20, aliases: ['Dose Vodka'] },
    { id: 'smirnoff-ice', name: 'Smirnoff Ice', expectedPrice: 12, aliases: ['Smirnoff Ice', 'Smirnoff Ice Longneck'] },
    { id: 'conhaque', name: 'Conhaque, mel e limão', expectedPrice: 10, aliases: ['Conhaque, mel e limão'] },
    { id: 'xeque-mate', name: 'Xeque Mate', expectedPrice: 18.5, aliases: ['Xeque Mate', 'Xeque Mate lata 362 ml'] },
  ] },
  { id: 'doces', title: 'Doces', items: [
    { id: 'beijos-dentadura', name: 'Beijos e dentadura', expectedPrice: 5, aliases: ['Beijos e dentadura'] },
    { id: 'fini-tube', name: 'Fini Tube', expectedPrice: 3, aliases: ['Fini Tube'] },
    { id: 'mentos', name: 'Mentos', expectedPrice: 5, aliases: ['Mentos'] },
    { id: 'trident', name: 'Trident', expectedPrice: 4, aliases: ['Trident'] },
    { id: 'palha-italiana', name: 'Palha italiana', expectedPrice: 5, aliases: ['Palha italiana'] },
    { id: 'pingo-bel', name: 'Pingo Bel', expectedPrice: 5, aliases: ['Pingo Bel'] },
    { id: 'bananinha', name: 'Bananinha', expectedPrice: 3.5, aliases: ['Bananinha'] },
    { id: 'doce-amendoim', name: 'Doce de amendoim', expectedPrice: 5, aliases: ['Doce de amendoim'] },
  ] },
]

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '')

export function createStarterMenu(products: MenuCatalogProduct[]): MenuDocument {
  return { title: 'CARDÁPIO', pages: approvedMenuTemplate.map(page => ({
    id: page.id, title: page.title, durationSeconds: 10, visible: true,
    items: page.items.map(item => {
      const aliases = new Set(item.aliases.map(normalize))
      return { id: item.id, name: item.name, description: item.description ?? '', visible: true,
        productIds: products.filter(product => aliases.has(normalize(product.name))).map(product => product.id) }
    }),
  })) }
}
