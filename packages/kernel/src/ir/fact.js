export const known = (value, origin) => ({ state: 'known', value, origin });
export const absent = () => ({ state: 'absent' });
export const unknown = (reason) => ({ state: 'unknown', reason });
export const isKnown = (f) => f.state === 'known';
export const isUnknown = (f) => f.state === 'unknown';
