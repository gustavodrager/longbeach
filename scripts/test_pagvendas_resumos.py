import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('summary',Path(__file__).with_name('preparar-pagvendas-resumos.py'));summary=importlib.util.module_from_spec(spec);spec.loader.exec_module(summary)
class MonthlySummaryTests(unittest.TestCase):
 def fixture(self):return {'url':'https://pagvendas.pagseguro.uol.com.br/dashboard/relatorios/tipos-pagamentos','rangeStart':'2026-08-01','rangeEnd':'2026-08-05','captures':[{'month':'2026-08','text':'01/08/2026 00:00 05/08/2026 23:59','rows':['Tipo de PagamentoValor Total','CréditoR$ 10,00','FiadoR$ 5,00','TotalR$ 15,00']}]}
 def test_reconciles_period_and_does_not_invent_receipt_for_fiado(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source.json';p.write_text(json.dumps(self.fixture()));result=summary.prepare(p,1500)
   self.assertEqual(len(result['records']),2);self.assertEqual(result['records'][0]['data']['state'],'Parcial até 05/08/2026');self.assertEqual(result['records'][1]['data']['state'],'Fiado na fonte')
 def test_rejects_incomplete_total_or_duplicate_month(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source.json';raw=self.fixture();p.write_text(json.dumps(raw))
   with self.assertRaises(ValueError):summary.prepare(p,9999)
   raw['captures']*=2;p.write_text(json.dumps(raw))
   with self.assertRaises(ValueError):summary.prepare(p,3000)
