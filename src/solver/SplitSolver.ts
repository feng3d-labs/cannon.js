interface SSNode
{
    body: Body;
    children: SSNode[];
    eqs: Equation[];
    visited: boolean;
};

export class SplitSolver extends Solver
{
    subsolver: Solver;
    nodes: SSNode[];
    nodePool: SSNode[];

    /**
     * Splits the equations into islands and solves them independently. Can improve performance.
     * 
     * @param subsolver
     */
    constructor(subsolver: Solver)
    {
        super();
        this.iterations = 10;
        this.tolerance = 1e-7;
        this.subsolver = subsolver;
        this.nodes = [];
        this.nodePool = [];

        // Create needed nodes, reuse if possible
        while (this.nodePool.length < 128)
        {
            this.nodePool.push(this.createNode());
        }
    }

    createNode(): SSNode
    {
        return { body: null, children: [], eqs: [], visited: false };
    }

    /**
     * Solve the subsystems
     * @method solve
     * @param  {Number} dt
     * @param  {World} world
     */
    solve(dt: number, world: World)
    {
        var nodes = SplitSolver_solve_nodes,
            nodePool = this.nodePool,
            bodies = world.bodies,
            equations = this.equations,
            Neq = equations.length,
            Nbodies = bodies.length,
            subsolver = this.subsolver;

        // Create needed nodes, reuse if possible
        while (nodePool.length < Nbodies)
        {
            nodePool.push(this.createNode());
        }
        nodes.length = Nbodies;
        for (var i = 0; i < Nbodies; i++)
        {
            nodes[i] = nodePool[i];
        }

        // Reset node values
        for (var i = 0; i !== Nbodies; i++)
        {
            var node = nodes[i];
            node.body = bodies[i];
            node.children.length = 0;
            node.eqs.length = 0;
            node.visited = false;
        }
        for (var k = 0; k !== Neq; k++)
        {
            var eq = equations[k],
                i0 = bodies.indexOf(eq.bi),
                j = bodies.indexOf(eq.bj),
                ni = nodes[i0],
                nj = nodes[j];
            ni.children.push(nj);
            ni.eqs.push(eq);
            nj.children.push(ni);
            nj.eqs.push(eq);
        }

        var child, n = 0, eqs = SplitSolver_solve_eqs;

        subsolver.tolerance = this.tolerance;
        subsolver.iterations = this.iterations;

        var dummyWorld = SplitSolver_solve_dummyWorld;
        while ((child = getUnvisitedNode(nodes)))
        {
            eqs.length = 0;
            dummyWorld.bodies.length = 0;
            bfs(child, visitFunc, dummyWorld.bodies, eqs);

            var Neqs = eqs.length;

            eqs = eqs.sort(sortById);

            for (var i = 0; i !== Neqs; i++)
            {
                subsolver.addEquation(eqs[i]);
            }

            var iter = subsolver.solve(dt, dummyWorld);
            subsolver.removeAllEquations();
            n++;
        }

        return n;
    }
}


// Returns the number of subsystems
var SplitSolver_solve_nodes: SSNode[] = []; // All allocated node objects
var SplitSolver_solve_nodePool = []; // All allocated node objects
var SplitSolver_solve_eqs = [];   // Temp array
var SplitSolver_solve_bds = [];   // Temp array
var SplitSolver_solve_dummyWorld: { bodies: Body[] } = { bodies: [] }; // Temp object

var STATIC = Body.STATIC;
function getUnvisitedNode(nodes)
{
    var Nnodes = nodes.length;
    for (var i = 0; i !== Nnodes; i++)
    {
        var node = nodes[i];
        if (!node.visited && !(node.body.type & STATIC))
        {
            return node;
        }
    }
    return false;
}

var queue = [];
function bfs(root, visitFunc, bds, eqs)
{
    queue.push(root);
    root.visited = true;
    visitFunc(root, bds, eqs);
    while (queue.length)
    {
        var node = queue.pop();
        // Loop over unvisited child nodes
        var child;
        while ((child = getUnvisitedNode(node.children)))
        {
            child.visited = true;
            visitFunc(child, bds, eqs);
            queue.push(child);
        }
    }
}

function visitFunc(node: SSNode, bds: Body[], eqs: Equation[])
{
    bds.push(node.body);
    var Neqs = node.eqs.length;
    for (var i = 0; i !== Neqs; i++)
    {
        var eq = node.eqs[i];
        if (eqs.indexOf(eq) === -1)
        {
            eqs.push(eq);
        }
    }
}

function sortById(a, b)
{
    return b.id - a.id;
}

