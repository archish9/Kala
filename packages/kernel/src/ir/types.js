import { absent } from './fact.js';
export const emptyStyleFacts = () => ({
    space: { padding: absent(), margin: absent(), gap: absent() },
    type: {
        size: absent(), weight: absent(), leading: absent(),
        tracking: absent(), family: absent()
    },
    color: { fg: absent(), bg: absent(), border: absent() },
    shape: { radius: absent(), borderWidth: absent(), shadow: absent() },
    layout: { display: absent(), direction: absent(), align: absent() },
    raw: []
});
export const makeNode = (p) => ({
    kind: 'element',
    parent: null,
    children: [],
    style: emptyStyleFacts(),
    text: null,
    branch: null,
    loc: { line: 1, col: 0 },
    ...p
});
