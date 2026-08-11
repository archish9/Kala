export const nodeById = (doc, id) => doc.nodes.find(n => n.id === id);
export const ancestors = (doc, nodeId) => {
    const out = [];
    let cur = nodeById(doc, nodeId);
    while (cur?.parent) {
        const parent = nodeById(doc, cur.parent);
        if (!parent)
            break;
        out.push(parent);
        cur = parent;
    }
    return out;
};
