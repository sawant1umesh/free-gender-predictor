import { runCalendarEngineTests } from './calendar/calendar.test';
import { runPredictorEngineTests } from './predictor/predictor.test';
import { runApiDataContractTests } from './api/api.test';
import { runConceptionEngineTests } from './conception/conception.test';

export function runAllSuites() {
  console.log('====================================================');
  console.log('🧪 RUNNING ALL TEST SUITES FOR GENDER PREDICTOR ENGINE');
  console.log('====================================================\n');

  try {
    runCalendarEngineTests();
    console.log('');
    runPredictorEngineTests();
    console.log('');
    runApiDataContractTests();
    console.log('');
    runConceptionEngineTests();
    console.log('\n====================================================');
    console.log('🎉 ALL TEST SUITES PASSED WITH 100% SUCCESS!');
    console.log('====================================================');
  } catch (err: unknown) {
    console.error('\n❌ TEST SUITE EXECUTION FAILED:', err);
    throw err;
  }
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.endsWith('test-runner.ts')) {
  runAllSuites();
}
