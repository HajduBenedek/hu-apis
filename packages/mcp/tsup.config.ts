import { sharedConfig } from '../../tsup.shared.js';

export default sharedConfig({ entry: ['src/index.ts', 'src/cli.ts'] });
