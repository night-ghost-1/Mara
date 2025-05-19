import { MaraMapNode } from "./MaraMapNode";

export class MaraMapNodeLink {
    Node: MaraMapNode;
    Weigth: number;

    constructor(node: MaraMapNode, weigth: number) {
        this.Node = node;
        this.Weigth = weigth;
    }
}