import { MaraUtils } from "../../MaraUtils";
import { MaraMapNode } from "./MaraMapNode";

export class MaraPath {
    Nodes: Array<MaraMapNode>;
    Length: number;

    constructor(nodes: Array<MaraMapNode>) {
        this.Nodes = nodes;

        let length = 0;

        for (let i = 0; i < nodes.length - 1; i ++) {
            length += MaraUtils.ChebyshevDistance(nodes[i].Region.Center, nodes[i + 1].Region.Center);
        }

        this.Length = length;
    }

    public ToString(): string {
        return this.Nodes.map((n) => n.Region.Center.ToString()).join(", ");
    }
}