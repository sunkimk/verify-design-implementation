import unittest,importlib.util,json,re,copy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('validator',root/'scripts/validate_acceptance_report.py'); v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
sample=json.loads(re.search(r'```json\n(.*?)\n```',(root/'references/report-contract.md').read_text(),re.S).group(1))
class ContractTests(unittest.TestCase):
 def test_current_report(self):self.assertEqual(v.validate(copy.deepcopy(sample)),[])
 def test_new_p3_rejected(self):
  d=copy.deepcopy(sample);d['issues'][0]['severity']='P3';d['summary']={'p0':0,'p1':0,'p2':0,'p3':1};self.assertTrue(v.validate(d))
 def test_legacy_explicit_and_unchanged(self):
  d=copy.deepcopy(sample);d['issues'][0]['severity']='P3';d['summary']={'p0':0,'p1':0,'p2':0,'p3':1};before=copy.deepcopy(d)
  self.assertEqual(v.validate(d,allow_legacy_p3=True),[]);self.assertEqual(d,before)
 def test_pass_cannot_hide_unchecked(self):
  d=copy.deepcopy(sample);d['issues']=[];d['summary']={'p0':0,'p1':0,'p2':0};d['verdict']='PASS';d['coverage'][0]['status']='not_run';self.assertTrue(v.validate(d))
 def test_pass_cannot_hide_defect(self):
  d=copy.deepcopy(sample);d['verdict']='PASS';self.assertTrue(v.validate(d))
if __name__=='__main__':unittest.main()
