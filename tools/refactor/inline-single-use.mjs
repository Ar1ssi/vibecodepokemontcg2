// Inlines functions that have exactly one call site, when static checks prove the move
// cannot change behaviour. Anything it cannot prove is left alone and reported with a reason.
// Usage: node inline.mjs <repo> <report.json> [--dry] [--exclude=<file>] [--max-rounds=N] [prefix...]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const [repo, reportPath, ...prefixes] = argv.filter((a) => !a.startsWith('--'));
const dry = flags.includes('--dry');
const flagValue = (name) => flags.find((f) => f.startsWith(`--${name}=`))?.split('=')[1];
const maxRounds = Number(flagValue('max-rounds') ?? 12);
const excludeFile = flagValue('exclude');
const excluded = new Set(
    excludeFile && fs.existsSync(excludeFile)
        ? fs.readFileSync(excludeFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
        : []
);
const ts = createRequire(path.join(repo, 'package.json'))('typescript');
const esbuild = createRequire(path.join(repo, 'package.json'))('esbuild');
const compiles = (code) => {
    try {
        esbuild.transformSync(code, { loader: 'js', format: 'esm', logLevel: 'silent' });
        return true;
    } catch {
        return false;
    }
};
const SK = ts.SyntaxKind;

const tracked = execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter((f) => /\.(js|mjs)$/.test(f))
    .filter((f) => /^(client|server|shared|bot|scripts)\//.test(f))
    .filter((f) => !f.startsWith('client/src/vendor/') && !f.includes('.generated.'));
const isTest = (f) => /\.test\.(js|mjs)$/.test(f) || /(^|\/)(e2e|tests?|__tests__)\//.test(f);
const isApp = (f) => /^(client|server|shared)\//.test(f) && !isTest(f);
const inScope = (f) => isApp(f) && (prefixes.length === 0 || prefixes.some((p) => f.startsWith(p)));
const abs = (f) => path.join(repo, f);
const rel = (f) => path.relative(repo, f).split(path.sep).join('/');
const files = tracked.map(abs);

// Tests that read source as text may assert on a function's name: those names stay.
const namesPinnedByTextTests = new Set();
for (const f of tracked.filter(isTest)) {
    const text = fs.readFileSync(abs(f), 'utf8');
    if (!/readFileSync|readFile\(/.test(text)) continue;
    for (const w of text.match(/[A-Za-z_$][\w$]*/g) ?? []) namesPinnedByTextTests.add(w);
}

const versions = new Map();
const options = {
    allowJs: true,
    checkJs: false,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    maxNodeModuleJsDepth: 0,
    types: [],
};
const host = {
    getScriptFileNames: () => files,
    getScriptVersion: (f) => String(versions.get(f) ?? 0),
    getScriptSnapshot: (f) =>
        fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined,
    getCurrentDirectory: () => repo,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: fs.existsSync,
    readFile: (f) => fs.readFileSync(f, 'utf8'),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
};
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());

class Reject extends Error {}
const reject = (reason) => {
    throw new Reject(reason);
};

const isFn = (n) => ts.isFunctionLike(n);
const ownFn = (n) => ts.findAncestor(n.parent, isFn);
const lineStart = (text, pos) => text.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (text, pos) => {
    const i = text.indexOf('\n', pos);
    return i === -1 ? text.length : i;
};
const indentAt = (text, pos) => /^[ \t]*/.exec(text.slice(lineStart(text, pos)))[0];

// True when `id` reads or declares a binding (not a property name, label or key).
function isBindingIdentifier(id) {
    const p = id.parent;
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
    if (ts.isPropertyAssignment(p) && p.name === id) return false;
    if (ts.isBindingElement(p) && p.propertyName === id) return false;
    if (
        (ts.isMethodDeclaration(p) ||
            ts.isPropertyDeclaration(p) ||
            ts.isGetAccessor(p) ||
            ts.isSetAccessor(p) ||
            ts.isEnumMember(p)) &&
        p.name === id
    )
        return false;
    if (ts.isImportSpecifier(p) && p.propertyName === id) return false;
    if (ts.isExportSpecifier(p)) return false;
    if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
    if (ts.isQualifiedName(p) || ts.isMetaProperty(p)) return false;
    if (p.kind === SK.JsxAttribute) return false;
    return true;
}

function isAssignmentTarget(node) {
    let n = node;
    let p = n.parent;
    while (
        ts.isParenthesizedExpression(p) ||
        ts.isArrayLiteralExpression(p) ||
        ts.isObjectLiteralExpression(p) ||
        ts.isSpreadElement(p) ||
        ts.isSpreadAssignment(p) ||
        ts.isShorthandPropertyAssignment(p) ||
        (ts.isPropertyAssignment(p) && p.initializer === n)
    ) {
        n = p;
        p = n.parent;
    }
    if (ts.isBinaryExpression(p) && p.left === n) {
        const k = p.operatorToken.kind;
        return k >= SK.FirstAssignment && k <= SK.LastAssignment;
    }
    if (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) {
        return p.operator === SK.PlusPlusToken || p.operator === SK.MinusMinusToken;
    }
    if ((ts.isForInStatement(p) || ts.isForOfStatement(p)) && p.initializer === n) return true;
    return false;
}

const isLiteralArg = (n) =>
    ts.isNumericLiteral(n) ||
    ts.isStringLiteral(n) ||
    ts.isNoSubstitutionTemplateLiteral(n) ||
    n.kind === SK.TrueKeyword ||
    n.kind === SK.FalseKeyword ||
    n.kind === SK.NullKeyword ||
    (ts.isIdentifier(n) && n.text === 'undefined') ||
    (ts.isPrefixUnaryExpression(n) && n.operator === SK.MinusToken && ts.isNumericLiteral(n.operand));

const isPrimaryish = (n) =>
    ts.isIdentifier(n) ||
    ts.isLiteralExpression(n) ||
    ts.isPropertyAccessExpression(n) ||
    ts.isElementAccessExpression(n) ||
    ts.isCallExpression(n) ||
    ts.isParenthesizedExpression(n) ||
    ts.isArrayLiteralExpression(n) ||
    ts.isTemplateExpression(n) ||
    (ts.isNewExpression(n) && !!n.arguments) ||
    n.kind === SK.ThisKeyword ||
    n.kind === SK.TrueKeyword ||
    n.kind === SK.FalseKeyword ||
    n.kind === SK.NullKeyword;

// Does `expr`, put where `slot` stands, need parentheses to keep its meaning?
function needsParens(expr, slot) {
    const p = slot.parent;
    const startsStatement = ts.isExpressionStatement(p) || (ts.isArrowFunction(p) && p.body === slot);
    if (ts.isObjectLiteralExpression(expr) || ts.isFunctionExpression(expr) || ts.isClassExpression(expr)) {
        return startsStatement;
    }
    if (isPrimaryish(expr)) return false;
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === SK.CommaToken) return true;
    if (ts.isVariableDeclaration(p) && p.initializer === slot) return false;
    if (ts.isReturnStatement(p) || ts.isExpressionStatement(p) || ts.isThrowStatement(p)) return false;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(slot)) return false;
    if (ts.isPropertyAssignment(p) && p.initializer === slot) return false;
    if (ts.isArrayLiteralExpression(p) || ts.isParenthesizedExpression(p) || ts.isTemplateSpan(p)) return false;
    if ((ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p) || ts.isSwitchStatement(p)) && p.expression === slot)
        return false;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === slot) return false;
    if (ts.isBinaryExpression(p) && p.right === slot && p.operatorToken.kind === SK.EqualsToken) return false;
    if (ts.isArrowFunction(p) && p.body === slot) return false;
    if (ts.isSpreadElement(p) || ((ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.expression === slot)) return false;
    const P = ts.OperatorPrecedence;
    const prec = ts.getExpressionPrecedence?.(expr);
    if (prec === undefined || !P) return true;
    if (ts.isConditionalExpression(p)) return p.condition === slot ? prec <= P.Conditional : prec < P.Assignment;
    if (ts.isBinaryExpression(p) && ts.isBinaryExpression(expr)) {
        const outer = p.operatorToken.kind;
        const inner = expr.operatorToken.kind;
        const logical = (k) => k === SK.AmpersandAmpersandToken || k === SK.BarBarToken;
        const coalesce = (k) => k === SK.QuestionQuestionToken;
        if ((logical(outer) && coalesce(inner)) || (coalesce(outer) && logical(inner))) return true;
        if (outer === SK.AsteriskAsteriskToken || inner === SK.AsteriskAsteriskToken) return true;
        const outerPrec = ts.getExpressionPrecedence(p);
        if (prec > outerPrec) return false;
        return !(prec === outerPrec && p.left === slot && inner === outer);
    }
    return true;
}

function endsWithJump(stmt) {
    if (!stmt) return false;
    if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) return true;
    if (ts.isBlock(stmt)) return endsWithJump(stmt.statements[stmt.statements.length - 1]);
    if (ts.isIfStatement(stmt)) return !!stmt.elseStatement && endsWithJump(stmt.thenStatement) && endsWithJump(stmt.elseStatement);
    if (ts.isTryStatement(stmt)) {
        if (stmt.finallyBlock && endsWithJump(stmt.finallyBlock)) return true;
        return endsWithJump(stmt.tryBlock) && !!stmt.catchClause && endsWithJump(stmt.catchClause.block);
    }
    return false;
}

// Lines of `text` that begin inside a template literal must keep their exact leading space.
function protectedLineStarts(text) {
    const sf = ts.createSourceFile('fragment.js', text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const spans = [];
    const visit = (n) => {
        if (
            n.kind === SK.NoSubstitutionTemplateLiteral ||
            n.kind === SK.TemplateHead ||
            n.kind === SK.TemplateMiddle ||
            n.kind === SK.TemplateTail
        ) {
            spans.push([n.getStart(sf), n.getEnd()]);
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    const out = new Set();
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
        const start = i + 1;
        if (spans.some(([s, e]) => start > s && start < e)) out.add(start);
    }
    return out;
}

// Re-indent a block of whole lines so its shallowest line sits at `indent`.
function reindent(text, indent) {
    const guarded = protectedLineStarts(text);
    const lines = [];
    let pos = 0;
    for (const line of text.split('\n')) {
        lines.push({ line, keep: guarded.has(pos) });
        pos += line.length + 1;
    }
    const depths = lines.filter((l) => !l.keep && l.line.trim()).map((l) => /^ */.exec(l.line)[0].length);
    const min = depths.length ? Math.min(...depths) : 0;
    return lines
        .map((l) => (l.keep ? l.line : l.line.trim() ? indent + l.line.slice(min) : ''))
        .join('\n');
}

// Shift every continuation line of an expression by `delta` columns.
function shiftContinuation(text, delta) {
    if (!text.includes('\n') || delta === 0) return text;
    const guarded = protectedLineStarts(`(${text})`);
    let pos = 0;
    return text
        .split('\n')
        .map((line, i) => {
            const start = pos;
            pos += line.length + 1;
            if (i === 0 || guarded.has(start + 1) || !line.trim()) return line;
            if (delta > 0) return ' '.repeat(delta) + line;
            return line.slice(Math.min(-delta, /^ */.exec(line)[0].length));
        })
        .join('\n');
}

function applyEdits(text, edits, base = 0) {
    let out = text;
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, e.start - base) + e.text + out.slice(e.end - base);
    }
    return out;
}

function analyse(program) {
    const checker = program.getTypeChecker();
    const reassigned = new Map();

    const valueSymbol = (id) => {
        if (ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
            return checker.getShorthandAssignmentValueSymbol(id.parent);
        }
        return checker.getSymbolAtLocation(id);
    };

    function isReassigned(sym) {
        if (reassigned.has(sym)) return reassigned.get(sym);
        let result = false;
        const decls = sym.declarations ?? [];
        const name = sym.name;
        for (const sf of new Set(decls.map((d) => d.getSourceFile()))) {
            const visit = (n) => {
                if (result) return;
                if (ts.isIdentifier(n) && n.text === name && isAssignmentTarget(n) && valueSymbol(n) === sym) result = true;
                ts.forEachChild(n, visit);
            };
            visit(sf);
        }
        reassigned.set(sym, result);
        return result;
    }

    function isStableBinding(id) {
        const sym = valueSymbol(id);
        if (!sym) return false;
        const decl = sym.valueDeclaration ?? sym.declarations?.[0];
        if (!decl) return false;
        if (ts.isVariableDeclaration(decl) && ts.isVariableDeclarationList(decl.parent)) {
            if (decl.parent.flags & ts.NodeFlags.Const) return true;
        }
        if (ts.isNamespaceImport(decl)) return true;
        if (sym.flags & ts.SymbolFlags.Alias) {
            const target = checker.getAliasedSymbol(sym);
            const targetDecl = target?.valueDeclaration;
            if (!targetDecl) return false;
            if (ts.isVariableDeclaration(targetDecl) && targetDecl.parent.flags & ts.NodeFlags.Const) return true;
            return !isReassigned(target);
        }
        return !isReassigned(sym);
    }

    const resolveAt = (name, location) =>
        checker.resolveName
            ? checker.resolveName(name, location, ts.SymbolFlags.Value, false)
            : checker.getSymbolsInScope(location, ts.SymbolFlags.Value).find((s) => s.name === name);

    // Every outside name the moved code reads must mean the same thing at the call site.
    function checkFreeNames(root, fn, call) {
        const visit = (n) => {
            if (ts.isIdentifier(n) && isBindingIdentifier(n) && n.text !== 'undefined') {
                const sym = valueSymbol(n);
                const declaredInside = sym?.declarations?.some((d) => d.getSourceFile() === fn.getSourceFile() && d.pos >= fn.pos && d.end <= fn.end);
                if (!declaredInside) {
                    const there = resolveAt(n.text, call);
                    if ((sym ?? undefined) !== (there ?? undefined)) reject('name-means-something-else-at-call-site');
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(root);
    }

    function containerOf(stmt) {
        const p = stmt.parent;
        if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isModuleBlock(p)) return p;
        if (ts.isCaseClause(p) || ts.isDefaultClause(p)) return p.parent;
        return null;
    }

    // Names the inlined code would declare must not already be used in the caller's block.
    function checkIntroduced(names, container, skipRanges) {
        if (names.size === 0) return;
        const visit = (n) => {
            if (skipRanges.some(([s, e]) => n.pos >= s && n.end <= e)) return;
            if (ts.isIdentifier(n) && names.has(n.text) && isBindingIdentifier(n)) reject('local-name-collides-with-caller');
            ts.forEachChild(n, visit);
        };
        visit(container);
    }

    function bindingNames(nameNode, out) {
        if (ts.isIdentifier(nameNode)) out.add(nameNode.text);
        else for (const el of nameNode.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
    }

    function describeCallee(fn) {
        if (fn.modifiers?.some((m) => m.kind === SK.AsyncKeyword)) reject('async');
        if (fn.asteriskToken) reject('generator');
        if (fn.typeParameters) reject('type-params');
        const body = fn.body;
        const returns = [];
        const bodyLevelNames = new Set();
        const visit = (n) => {
            if (n !== fn && isFn(n)) {
                if (!ts.isArrowFunction(n)) return;
                // Arrow functions share `this`/`arguments` with the enclosing function.
                const inner = (m) => {
                    if (m.kind === SK.ThisKeyword || (ts.isIdentifier(m) && m.text === 'arguments')) reject('this-or-arguments');
                    if (isFn(m) && !ts.isArrowFunction(m)) return;
                    ts.forEachChild(m, inner);
                };
                ts.forEachChild(n, inner);
                return;
            }
            if (n.kind === SK.ThisKeyword || n.kind === SK.SuperKeyword) reject('this-or-arguments');
            if (ts.isIdentifier(n) && n.text === 'arguments') reject('this-or-arguments');
            if (ts.isReturnStatement(n)) returns.push(n);
            if (ts.isVariableDeclarationList(n) && !(n.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) reject('var-in-body');
            if (ts.isYieldExpression(n) || ts.isAwaitExpression(n)) reject('await-or-yield');
            ts.forEachChild(n, visit);
        };
        ts.forEachChild(fn, visit);
        let single = null;
        if (!ts.isBlock(body)) single = ts.isParenthesizedExpression(body) ? body.expression : body;
        else if (body.statements.length === 1 && ts.isReturnStatement(body.statements[0]) && body.statements[0].expression) {
            single = body.statements[0].expression;
        }
        if (ts.isBlock(body)) {
            for (const s of body.statements) {
                if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) bindingNames(d.name, bodyLevelNames);
                if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name) bodyLevelNames.add(s.name.text);
            }
        }
        const last = ts.isBlock(body) ? body.statements[body.statements.length - 1] : null;
        const terminalReturn = last && ts.isReturnStatement(last) ? last : null;
        const singleExit = !ts.isBlock(body) || returns.length === 0 || (returns.length === 1 && returns[0] === terminalReturn);
        return { body, returns, single, bodyLevelNames, terminalReturn, singleExit, last };
    }

    function paramUses(fn, param) {
        const sym = checker.getSymbolAtLocation(param.name);
        const uses = [];
        let assigned = false;
        const visit = (n) => {
            if (ts.isIdentifier(n) && n.text === param.name.text && n !== param.name && isBindingIdentifier(n) && valueSymbol(n) === sym) {
                uses.push(n);
                if (isAssignmentTarget(n)) assigned = true;
            }
            ts.forEachChild(n, visit);
        };
        visit(fn.body);
        const inBody = uses.length;
        for (const other of fn.parameters) if (other.initializer) visit(other.initializer);
        if (uses.length !== inBody) reject('default-reads-another-param');
        return { uses, assigned };
    }

    function countReads(root, decl) {
        const sym = checker.getSymbolAtLocation(decl.name);
        let count = 0;
        const visit = (n) => {
            if (ts.isIdentifier(n) && n !== decl.name && n.text === decl.name.text && isBindingIdentifier(n) && valueSymbol(n) === sym) count++;
            ts.forEachChild(n, visit);
        };
        visit(root);
        return count;
    }

    const declaresInside = (fn, name) => {
        let found = false;
        const visit = (n) => {
            if (found) return;
            if (ts.isIdentifier(n) && n.text === name) {
                const p = n.parent;
                if (
                    ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p)) && p.name === n) ||
                    ts.isCatchClause(p.parent ?? p)
                ) {
                    found = true;
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(fn);
        return found;
    };

    // A literal dropped into a test (`true ? a : b`, `'x' === 'x'`) would need folding by hand.
    const feedsDecision = (use) => {
        const p = use.parent;
        if (ts.isConditionalExpression(p) && p.condition === use) return true;
        if (ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p)) return true;
        if (ts.isPrefixUnaryExpression(p) && p.operator === SK.ExclamationToken) return true;
        if (ts.isTypeOfExpression(p)) return true;
        if (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) return p.expression === use;
        if (ts.isTemplateSpan(p)) return true;
        if (ts.isBinaryExpression(p)) {
            const k = p.operatorToken.kind;
            return (
                k === SK.AmpersandAmpersandToken ||
                k === SK.BarBarToken ||
                k === SK.QuestionQuestionToken ||
                k === SK.InstanceOfKeyword ||
                k === SK.InKeyword ||
                (k >= SK.LessThanToken && k <= SK.ExclamationEqualsEqualsToken)
            );
        }
        return false;
    };

    // Decide, per parameter, whether its argument is read in place, substituted, or bound.
    function planParams(fn, call, mode, exprRoot) {
        if (call.arguments.some((a) => ts.isSpreadElement(a))) reject('spread-argument');
        if (call.arguments.length > fn.parameters.length) reject('extra-arguments');
        const substitutions = [];
        const bindings = [];
        const boundNames = new Set();
        let complexSubstituted = false;
        const substitution = (use, argText, argNode) => {
            if (ts.isShorthandPropertyAssignment(use.parent)) {
                return { start: use.getStart(), end: use.getEnd(), text: `${use.text}: ${argText}` };
            }
            const wrap = argNode && !isLiteralArg(argNode) && needsParens(argNode, use);
            return { start: use.getStart(), end: use.getEnd(), text: wrap ? `(${argText})` : argText };
        };
        const bind = (name, assigned, valueText) => {
            if (mode === 'expr') reject('argument-needs-binding');
            boundNames.add(name);
            bindings.push(`${assigned ? 'let' : 'const'} ${name} = ${valueText};`);
        };
        fn.parameters.forEach((param, i) => {
            const arg = call.arguments[i];
            if (param.dotDotDotToken) reject('rest-param');
            if (param.questionToken || param.type) reject('typed-param');
            if (!ts.isIdentifier(param.name)) {
                if (mode === 'expr' || !arg || param.initializer) reject('destructured-param');
                bindingNames(param.name, boundNames);
                bindings.push(`const ${param.name.getText()} = ${arg.getText()};`);
                return;
            }
            const name = param.name.text;
            const { uses, assigned } = paramUses(fn, param);
            if (!arg) {
                if (!param.initializer) {
                    if (uses.length) reject('missing-argument');
                    return;
                }
                const init = param.initializer;
                if (uses.length === 0) {
                    if (!isLiteralArg(init) && !ts.isIdentifier(init)) reject('missing-argument');
                    return;
                }
                if (isLiteralArg(init) && !assigned && !uses.some(feedsDecision) && (mode === 'expr' || uses.length === 1)) {
                    for (const use of uses) substitutions.push(substitution(use, init.getText(), null));
                    return;
                }
                bind(name, assigned, init.getText());
                return;
            }
            if (param.initializer && (!isLiteralArg(arg) || (ts.isIdentifier(arg) && arg.text === 'undefined'))) {
                reject('default-param-with-argument');
            }
            if (uses.length === 0) {
                if (!(ts.isIdentifier(arg) || isLiteralArg(arg))) reject('unused-param-with-effectful-argument');
                return;
            }
            if (ts.isIdentifier(arg) && arg.text === name && arg.text !== 'undefined') {
                if (assigned || !isStableBinding(arg)) reject('same-name-argument-not-stable');
                return;
            }
            const literal = isLiteralArg(arg);
            const stableName = ts.isIdentifier(arg) && !literal && isStableBinding(arg) && !declaresInside(fn, arg.text);
            // A stable name reads the same wherever it stands; a literal repeated would need a name.
            if (!assigned && (stableName || (literal && !uses.some(feedsDecision) && (mode === 'expr' || uses.length === 1)))) {
                for (const use of uses) substitutions.push(substitution(use, arg.getText(), literal ? null : arg));
                return;
            }
            if (mode === 'expr') {
                const argText = arg.getText();
                if (literal || assigned || complexSubstituted || uses.length !== 1 || argText.includes('\n')) reject('argument-needs-binding');
                if (ts.isIdentifier(arg)) reject('argument-needs-binding');
                const up = uses[0].parent;
                if (ts.isBinaryExpression(up) && [SK.AmpersandAmpersandToken, SK.BarBarToken, SK.QuestionQuestionToken].includes(up.operatorToken.kind)) {
                    reject('argument-needs-binding');
                }
                if (!evaluatedFirstInside(uses[0], exprRoot)) reject('argument-needs-binding');
                complexSubstituted = true;
                substitutions.push(substitution(uses[0], argText, arg));
                return;
            }
            bind(name, assigned, arg.getText());
        });
        return { substitutions, bindings, boundNames };
    }

    const isPureStable = (n) =>
        isLiteralArg(n) ||
        (ts.isIdentifier(n) && isStableBinding(n)) ||
        ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        n.kind === SK.ThisKeyword;

    // True when `node` is the first thing `root` evaluates, exactly once and unconditionally.
    function evaluatedFirstInside(node, root) {
        let child = node;
        while (child !== root) {
            let p = child.parent;
            if (!p || isFn(p)) return false;
            if (ts.isParenthesizedExpression(p) || ts.isSpreadElement(p) || ts.isAwaitExpression(p)) {
                // transparent
            } else if (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) {
                if (p.expression !== child) return false;
            } else if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
                if (p.expression !== child) {
                    const callee = p.expression;
                    const calleeOk =
                        (ts.isIdentifier(callee) && isStableBinding(callee)) ||
                        (ts.isPropertyAccessExpression(callee) &&
                            !callee.questionDotToken &&
                            !p.questionDotToken &&
                            ts.isIdentifier(callee.expression) &&
                            isStableBinding(callee.expression));
                    if (!calleeOk) return false;
                    const idx = (p.arguments ?? []).indexOf(child);
                    if (idx < 0 || !p.arguments.slice(0, idx).every(isPureStable)) return false;
                }
            } else if (ts.isBinaryExpression(p)) {
                const k = p.operatorToken.kind;
                if (p.left !== child) {
                    if (k === SK.EqualsToken) {
                        if (!ts.isIdentifier(p.left)) return false;
                    } else if (k >= SK.FirstAssignment && k <= SK.LastAssignment) return false;
                    else if (k === SK.AmpersandAmpersandToken || k === SK.BarBarToken || k === SK.QuestionQuestionToken) return false;
                    else if (!isPureStable(p.left)) return false;
                }
            } else if (ts.isConditionalExpression(p)) {
                if (p.condition !== child) return false;
            } else if (ts.isPrefixUnaryExpression(p)) {
                if (p.operator === SK.PlusPlusToken || p.operator === SK.MinusMinusToken) return false;
            } else if (ts.isTypeOfExpression(p) || ts.isVoidExpression(p)) {
                // transparent
            } else if (ts.isTemplateSpan(p)) {
                const tpl = p.parent;
                const idx = tpl.templateSpans.indexOf(p);
                if (!tpl.templateSpans.slice(0, idx).every((s) => isPureStable(s.expression))) return false;
                p = tpl;
            } else if (ts.isArrayLiteralExpression(p)) {
                const idx = p.elements.indexOf(child);
                if (!p.elements.slice(0, idx).every(isPureStable)) return false;
            } else if (ts.isPropertyAssignment(p)) {
                if (p.initializer !== child || ts.isComputedPropertyName(p.name)) return false;
                const obj = p.parent;
                const idx = obj.properties.indexOf(p);
                const earlierOk = obj.properties
                    .slice(0, idx)
                    .every(
                        (q) =>
                            (ts.isPropertyAssignment(q) && !ts.isComputedPropertyName(q.name) && isPureStable(q.initializer)) ||
                            (ts.isShorthandPropertyAssignment(q) && isStableBinding(q.name))
                    );
                if (!earlierOk) return false;
                p = obj;
            } else if (ts.isVariableDeclaration(p)) {
                if (p.initializer !== child) return false;
                const list = p.parent;
                if (list.declarations[0] !== p || !ts.isVariableStatement(list.parent)) return false;
                p = list.parent;
            } else if (ts.isExpressionStatement(p) || ts.isReturnStatement(p) || ts.isThrowStatement(p)) {
                // transparent
            } else if (ts.isIfStatement(p) || ts.isSwitchStatement(p)) {
                if (p.expression !== child) return false;
            } else if (ts.isForOfStatement(p) || ts.isForInStatement(p)) {
                if (p.expression !== child || p.awaitModifier) return false;
            } else {
                return false;
            }
            child = p;
        }
        return true;
    }

    // The statement the call runs in, when the call is the first thing that statement evaluates.
    function hostStatement(call) {
        let n = call;
        while (n && !ts.isStatement(n)) {
            if (isFn(n)) return null;
            n = n.parent;
        }
        if (!n || !containerOf(n)) return null;
        return evaluatedFirstInside(call, n) ? n : null;
    }

    function leadingDoc(sfText, stmt) {
        const ranges = ts.getLeadingCommentRanges(sfText, stmt.getFullStart()) ?? [];
        let start = stmt.getStart();
        const kept = [];
        for (let i = ranges.length - 1; i >= 0; i--) {
            const r = ranges[i];
            const gap = sfText.slice(r.end, start);
            if (/\n[ \t]*\n/.test(gap)) break;
            kept.unshift(r);
            start = r.pos;
        }
        const lines = [];
        for (const r of kept) {
            const raw = sfText.slice(r.pos, r.end);
            if (raw.startsWith('//')) {
                lines.push(raw.trim());
                continue;
            }
            const inner = raw.replace(/^\/\*+/, '').replace(/\*+\/$/, '');
            let inTag = false;
            for (let l of inner.split('\n')) {
                l = l.replace(/^\s*\*? ?/, '').trimEnd();
                if (/^@\w+/.test(l)) {
                    inTag = true;
                    continue;
                }
                if (inTag && l.trim() === '') inTag = false;
                if (inTag) continue;
                lines.push(l.trim() ? `// ${l}` : '//');
            }
        }
        while (lines.length && lines[0] === '//') lines.shift();
        while (lines.length && lines[lines.length - 1] === '//') lines.pop();
        return { start, lines };
    }

    function removalRange(sfText, stmt, docStart) {
        const start = lineStart(sfText, docStart);
        if (sfText.slice(start, docStart).trim()) reject('definition-shares-a-line');
        let end = lineEnd(sfText, stmt.getEnd());
        if (sfText.slice(stmt.getEnd(), end).trim()) reject('definition-shares-a-line');
        end = Math.min(end + 1, sfText.length);
        const blankBefore = /\n[ \t]*\n$/.test(sfText.slice(0, start)) || start === 0;
        const nextLine = sfText.slice(end, lineEnd(sfText, end));
        if (blankBefore && nextLine.trim() === '' && end < sfText.length) end = lineEnd(sfText, end) + 1;
        return { start, end: Math.min(end, sfText.length) };
    }

    function plan({ fn, stmt, call, name }) {
        const sf = fn.getSourceFile();
        const text = sf.text;
        if (call.questionDotToken || call.typeArguments) reject('optional-call');
        if (call.pos >= stmt.pos && call.end <= stmt.end) reject('recursive');
        const callee = describeCallee(fn);
        const doc = leadingDoc(text, stmt);
        const removal = removalRange(text, stmt, doc.start);

        const anchorOf = (node) => {
            let s = node;
            while (s && !(ts.isStatement(s) && containerOf(s))) s = s.parent;
            return s ?? null;
        };
        const lineIsOwn = (node) => !text.slice(lineStart(text, node.getStart()), node.getStart()).trim();
        const truthTested = (slot) => {
            const p = slot.parent;
            if ((ts.isIfStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p)) && p.expression === slot) return true;
            if (ts.isConditionalExpression(p) && p.condition === slot) return true;
            return ts.isPrefixUnaryExpression(p) && p.operator === SK.ExclamationToken;
        };
        const exprTextAt = (given, subs, slot) => {
            let expr = given;
            if (truthTested(slot)) {
                if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'Boolean' && expr.arguments.length === 1) {
                    expr = expr.arguments[0];
                } else if (ts.isPrefixUnaryExpression(expr) && expr.operator === SK.ExclamationToken && ts.isPrefixUnaryExpression(expr.operand) && expr.operand.operator === SK.ExclamationToken) {
                    expr = expr.operand.operand;
                }
                while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
            }
            const inside = subs.filter((e) => e.start >= expr.getStart() && e.end <= expr.getEnd());
            let out = applyEdits(expr.getText(), inside, expr.getStart());
            out = shiftContinuation(out, indentAt(text, slot.getStart()).length - indentAt(text, expr.getStart()).length);
            return needsParens(expr, slot) ? `(${out})` : out;
        };

        const tryExpr = () => {
            const expr = callee.single;
            if (ts.isBlock(callee.body)) {
                const ret = callee.body.statements[0];
                const around = text.slice(callee.body.getStart() + 1, ret.getStart()) + text.slice(ret.getEnd(), callee.body.getEnd() - 1);
                if (around.trim()) reject('body-has-comments');
            }
            const params = planParams(fn, call, 'expr', expr);
            checkFreeNames(expr, fn, call);
            const edits = [{ start: call.getStart(), end: call.getEnd(), text: exprTextAt(expr, params.substitutions, call) }];
            let siteStart = call.getStart();
            if (doc.lines.length) {
                const anchor = anchorOf(call);
                if (!anchor || !lineIsOwn(anchor)) reject('nowhere-to-keep-comment');
                siteStart = lineStart(text, anchor.getStart());
                const indent = indentAt(text, anchor.getStart());
                edits.push({ start: siteStart, end: siteStart, text: doc.lines.map((l) => `${indent}${l}\n`).join('') });
            }
            let scope = call.parent;
            while (scope && !(ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isCaseBlock(scope))) scope = scope.parent;
            return { kind: 'expr', edits, site: [siteStart, call.getEnd()], scope: [scope.pos, scope.end], introduced: new Set() };
        };

        const trySplice = () => {
            if (!ts.isBlock(callee.body)) reject('expression-callee-needs-binding');
            const direct = call.parent;
            let host;
            let mode;
            if (callee.singleExit) {
                host = hostStatement(call);
                if (!host) reject('call-is-not-first-evaluated-in-its-statement');
                mode = 'hoist';
            } else {
                if (!(ts.isReturnStatement(direct) && direct.expression === call && containerOf(direct))) {
                    reject('early-return-outside-tail-position');
                }
                host = direct;
                mode = 'tail';
            }
            const container = containerOf(host);
            const hostLine = lineStart(text, host.getStart());
            if (!lineIsOwn(host)) reject('call-statement-shares-a-line');
            const hostEndLine = lineEnd(text, host.getEnd());
            const trailing = text.slice(host.getEnd(), hostEndLine).trim();
            if (trailing && !trailing.startsWith('//')) reject('call-statement-shares-a-line');
            if (host.pos < stmt.end && host.end > stmt.pos) reject('recursive');

            const params = planParams(fn, call, 'splice', null);
            checkFreeNames(callee.body, fn, call);
            for (const p of fn.parameters) if (p.initializer) checkFreeNames(p.initializer, fn, call);
            for (const p of fn.parameters) {
                if (ts.isIdentifier(p.name) && callee.bodyLevelNames.has(p.name.text)) reject('local-redeclares-param');
            }
            const introduced = new Set([...callee.bodyLevelNames, ...params.boundNames]);
            const inCase = ts.isCaseClause(host.parent) || ts.isDefaultClause(host.parent);

            const indent = indentAt(text, host.getStart());
            const bodyStart = callee.body.getStart() + 1;
            const bodyEnd = callee.body.getEnd() - 1;
            let bodyEdits = [...params.substitutions];
            const edits = [];
            let appendReturn = false;
            let dropHost = false;
            if (mode === 'hoist') {
                const ret = callee.terminalReturn;
                const valueUsed = !(ts.isExpressionStatement(host) && host.expression === call);
                let e = ret?.expression;
                let cutFrom = ret;
                let merged = false;
                const hostDecl = ts.isVariableStatement(host) && host.declarationList.declarations.length === 1 ? host.declarationList.declarations[0] : null;
                if (e && ts.isIdentifier(e) && callee.bodyLevelNames.has(e.text)) {
                    const stmts = callee.body.statements;
                    const prev = stmts[stmts.length - 2];
                    const decl = (s) =>
                        s && ts.isVariableStatement(s) && s.declarationList.declarations.length === 1 && ts.isIdentifier(s.declarationList.declarations[0].name) && s.declarationList.declarations[0].name.text === e.text
                            ? s.declarationList.declarations[0]
                            : null;
                    if (decl(prev)?.initializer && countReads(callee.body, decl(prev)) === 1 && lineIsOwn(prev)) {
                        // `const r = X; return r;` becomes X at the call site.
                        introduced.delete(e.text);
                        e = decl(prev).initializer;
                        cutFrom = prev;
                    } else if (hostDecl && hostDecl.initializer === call && ts.isIdentifier(hostDecl.name) && hostDecl.name.text === e.text) {
                        // The caller names the result as the callee does: the callee's declaration takes its place.
                        const own = stmts.map(decl).find(Boolean);
                        const calleeConst = own && own.parent.flags & ts.NodeFlags.Const;
                        const hostConst = host.declarationList.flags & ts.NodeFlags.Const;
                        if (own && (hostConst || !calleeConst)) {
                            introduced.delete(e.text);
                            merged = true;
                        }
                    }
                }
                checkIntroduced(introduced, container, [[stmt.pos, stmt.end], ...(merged ? [[hostDecl.name.pos, hostDecl.name.end]] : [])]);
                if (inCase && introduced.size) reject('declaration-in-case-clause');
                if (ret) {
                    if (!lineIsOwn(ret)) reject('return-shares-a-line');
                    const cut = [lineStart(text, cutFrom.getStart()), ret.getEnd()];
                    bodyEdits = bodyEdits.filter((x) => x.end <= cut[0] || x.start >= cut[1]);
                    bodyEdits.push({ start: cut[0], end: cut[1], text: '' });
                }
                if (merged) {
                    dropHost = true;
                } else if (!e) {
                    if (valueUsed) reject('caller-uses-missing-return-value');
                    dropHost = true;
                } else if (!valueUsed && (ts.isIdentifier(e) || isLiteralArg(e))) {
                    dropHost = true;
                } else {
                    edits.push({ start: call.getStart(), end: call.getEnd(), text: exprTextAt(e, params.substitutions, call) });
                }
                if (dropHost && trailing) reject('call-statement-has-trailing-comment');
            } else {
                checkIntroduced(introduced, container, [[stmt.pos, stmt.end]]);
                if (inCase && introduced.size) reject('declaration-in-case-clause');
                const fnOfHost = ownFn(host);
                if (!fnOfHost) reject('top-level-return');
                const body = fnOfHost.body;
                const hostIsLast = ts.isBlock(body) && body.statements[body.statements.length - 1] === host;
                const last = callee.last;
                const plainEnd = !last || ts.isExpressionStatement(last) || ts.isVariableStatement(last) || (ts.isIfStatement(last) && !last.elseStatement);
                if (!endsWithJump(last) && !plainEnd) reject('cannot-tell-whether-callee-falls-off-its-end');
                appendReturn = plainEnd && !hostIsLast;
            }
            let bodyText = applyEdits(text.slice(bodyStart, bodyEnd), bodyEdits, bodyStart);
            bodyText = bodyText.replace(/^[ \t]*\n/, '').replace(/\s+$/, '');
            if (/^ *\t/m.test(bodyText)) reject('tab-indented');
            if (!bodyText.includes('\n')) bodyText = bodyText.trim();
            const out = [];
            for (const l of doc.lines) out.push(indent + l);
            for (const b of params.bindings) out.push(indent + b);
            if (bodyText.trim()) out.push(reindent(bodyText, indent));
            if (appendReturn) out.push(`${indent}return;`);
            const pre = out.length ? `${out.join('\n')}\n` : '';
            if (mode === 'tail') {
                if (!pre) reject('empty-body');
                edits.push({ start: hostLine, end: host.getEnd(), text: pre.replace(/\n$/, '') });
            } else if (dropHost) {
                edits.push({ start: hostLine, end: Math.min(hostEndLine + 1, text.length), text: pre });
            } else if (pre) {
                edits.push({ start: hostLine, end: hostLine, text: pre });
            }
            return { kind: mode, edits, site: [hostLine, host.getEnd()], scope: [container.pos, container.end], introduced };
        };

        // The call is a whole arrow body or a braceless branch: the callee's body becomes its block.
        const tryWrap = () => {
            if (!ts.isBlock(callee.body)) reject('expression-callee-needs-binding');
            const direct = call.parent;
            let slot;
            let kind;
            let around;
            if (ts.isArrowFunction(direct) && direct.body === call) {
                slot = call;
                kind = 'arrow';
                around = direct;
            } else if ((ts.isExpressionStatement(direct) || ts.isReturnStatement(direct)) && direct.expression === call && !containerOf(direct) && !lineIsOwn(direct)) {
                const gp = direct.parent;
                const branch = ts.isIfStatement(gp) && (gp.thenStatement === direct || gp.elseStatement === direct);
                const loop = (ts.isForStatement(gp) || ts.isForOfStatement(gp) || ts.isForInStatement(gp) || ts.isWhileStatement(gp)) && gp.statement === direct;
                if (!branch && !loop) reject('call-is-not-first-evaluated-in-its-statement');
                slot = direct;
                kind = ts.isReturnStatement(direct) ? 'return' : 'stmt';
                around = direct;
            } else {
                reject('call-is-not-first-evaluated-in-its-statement');
            }
            if (kind === 'stmt' && !callee.singleExit) reject('early-return-outside-tail-position');
            const params = planParams(fn, call, 'splice', null);
            checkFreeNames(callee.body, fn, call);
            for (const p of fn.parameters) {
                if (p.initializer) checkFreeNames(p.initializer, fn, call);
                if (ts.isIdentifier(p.name) && callee.bodyLevelNames.has(p.name.text)) reject('local-redeclares-param');
            }
            const introduced = new Set([...callee.bodyLevelNames, ...params.boundNames]);
            checkIntroduced(introduced, around, [[call.expression.pos, call.expression.end]]);
            const outer = indentAt(text, slot.getStart());
            const inner = `${outer}  `;
            let bodyEdits = [...params.substitutions];
            let appendReturn = false;
            if (kind === 'stmt') {
                const ret = callee.terminalReturn;
                if (ret) {
                    if (!lineIsOwn(ret)) reject('return-shares-a-line');
                    const e = ret.expression;
                    if (e && !(ts.isIdentifier(e) || isLiteralArg(e))) {
                        const wrap = ts.isObjectLiteralExpression(e) || ts.isFunctionExpression(e) || ts.isClassExpression(e);
                        bodyEdits.push({ start: ret.getStart(), end: e.getStart(), text: wrap ? '(' : '' });
                        if (wrap) bodyEdits.push({ start: e.getEnd(), end: e.getEnd(), text: ')' });
                    } else {
                        const cut = [lineStart(text, ret.getStart()), ret.getEnd()];
                        bodyEdits = bodyEdits.filter((x) => x.end <= cut[0] || x.start >= cut[1]);
                        bodyEdits.push({ start: cut[0], end: cut[1], text: '' });
                    }
                }
            } else if (kind === 'return') {
                const last = callee.last;
                const plainEnd = !last || ts.isExpressionStatement(last) || ts.isVariableStatement(last) || (ts.isIfStatement(last) && !last.elseStatement);
                if (!endsWithJump(last) && !plainEnd) reject('cannot-tell-whether-callee-falls-off-its-end');
                appendReturn = plainEnd;
            }
            const bodyStart = callee.body.getStart() + 1;
            let bodyText = applyEdits(text.slice(bodyStart, callee.body.getEnd() - 1), bodyEdits, bodyStart);
            bodyText = bodyText.replace(/^[ \t]*\n/, '').replace(/\s+$/, '');
            if (/^ *\t/m.test(bodyText)) reject('tab-indented');
            if (!bodyText.includes('\n')) bodyText = bodyText.trim();
            const out = [];
            for (const l of doc.lines) out.push(inner + l);
            for (const b of params.bindings) out.push(inner + b);
            if (bodyText.trim()) out.push(reindent(bodyText, inner));
            if (appendReturn) out.push(`${inner}return;`);
            if (out.length === 0) reject('empty-body');
            const edits = [{ start: slot.getStart(), end: slot.getEnd(), text: `{\n${out.join('\n')}\n${outer}}` }];
            return { kind: `wrap-${kind}`, edits, site: [slot.getStart(), slot.getEnd()], scope: [around.pos, around.end], introduced };
        };

        const WRAPPABLE = new Set(['call-is-not-first-evaluated-in-its-statement', 'early-return-outside-tail-position', 'call-statement-shares-a-line']);
        const spliceOrWrap = () => {
            try {
                return trySplice();
            } catch (e) {
                if (!(e instanceof Reject) || !WRAPPABLE.has(e.message)) throw e;
                try {
                    return tryWrap();
                } catch (inner) {
                    throw inner instanceof Reject && WRAPPABLE.has(inner.message) ? e : inner;
                }
            }
        };

        let result;
        if (callee.single) {
            try {
                result = tryExpr();
            } catch (e) {
                if (!(e instanceof Reject) || !ts.isBlock(callee.body)) throw e;
                result = spliceOrWrap();
            }
        } else {
            result = spliceOrWrap();
        }
        result.edits.push({ start: removal.start, end: removal.end, text: '' });
        result.def = [removal.start, removal.end];
        result.name = name.text;
        return result;
    }

    return { plan, checker };
}

function findCandidates(program, sf, file) {
    const decls = [];
    const visit = (n) => {
        if (ts.isFunctionDeclaration(n) && n.name && n.body) decls.push({ name: n.name, fn: n, stmt: n });
        if (
            ts.isVariableDeclaration(n) &&
            ts.isIdentifier(n.name) &&
            n.initializer &&
            (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) &&
            n.parent.declarations.length === 1 &&
            ts.isVariableStatement(n.parent.parent)
        ) {
            decls.push({ name: n.name, fn: n.initializer, stmt: n.parent.parent });
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    const out = [];
    for (const d of decls) {
        const refs = ls.findReferences(file, d.name.getStart()) ?? [];
        let calls = 0;
        let other = 0;
        let call = null;
        for (const group of refs) {
            for (const r of group.references) {
                if (r.fileName === file && r.textSpan.start === d.name.getStart()) continue;
                if (r.fileName !== file) {
                    other++;
                    continue;
                }
                const node = ts.getTokenAtPosition(sf, r.textSpan.start);
                const p = node.parent;
                if (ts.isCallExpression(p) && p.expression === node) {
                    calls++;
                    call = p;
                } else {
                    other++;
                }
            }
        }
        if (calls !== 1 || other !== 0) continue;
        if (d.stmt.modifiers?.some((m) => m.kind === SK.ExportKeyword || m.kind === SK.DefaultKeyword)) continue;
        if (ts.isFunctionExpression(d.fn) && d.fn.name) continue;
        out.push({ ...d, call });
    }
    return out;
}

const report = { rounds: [], inlined: [], rejected: {} };
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];
for (let round = 1; round <= maxRounds; round++) {
    const program = ls.getProgram();
    const { plan } = analyse(program);
    const rejectedNow = {};
    let applied = 0;
    const changedFiles = [];
    for (const file of files) {
        const relFile = rel(file);
        if (!inScope(relFile)) continue;
        const sf = program.getSourceFile(file);
        if (!sf) continue;
        const plans = [];
        for (const c of findCandidates(program, sf, file)) {
            const key = `${relFile}:${c.name.text}`;
            try {
                if (excluded.has(key)) reject('excluded');
                if (namesPinnedByTextTests.has(c.name.text)) reject('named-in-a-source-reading-test');
                plans.push({ key, ...plan(c) });
            } catch (e) {
                if (!(e instanceof Reject)) throw e;
                rejectedNow[key] = e.message;
            }
        }
        plans.sort((a, b) => a.def[1] - a.def[0] - (b.def[1] - b.def[0]));
        const claimed = [];
        const chosen = [];
        const nests = (a, b) => (a[0] <= b[0] && a[1] >= b[1]) || (b[0] <= a[0] && b[1] >= a[1]);
        const meets = (set, other) => [...set].some((n) => other.has(n));
        for (const p of plans) {
            const ranges = [p.def, p.site];
            if (ranges.some((r) => claimed.some((c) => overlaps(r, c) || r[0] === c[0]))) continue;
            // Two inlines landing in nested scopes in one round must not see each other's names.
            p.names = new Set(p.edits.flatMap((e) => e.text.match(/[A-Za-z_$][\w$]*/g) ?? []));
            if (chosen.some((c) => nests(c.scope, p.scope) && (meets(p.introduced, c.names) || meets(c.introduced, p.names)))) continue;
            claimed.push(...ranges);
            chosen.push(p);
        }
        if (chosen.length === 0) continue;
        let next = applyEdits(sf.text, chosen.flatMap((p) => p.edits));
        if (!compiles(next)) {
            for (const p of [...chosen]) {
                if (compiles(applyEdits(sf.text, p.edits))) continue;
                chosen.splice(chosen.indexOf(p), 1);
                excluded.add(p.key);
                rejectedNow[p.key] = 'result-did-not-compile';
            }
            next = applyEdits(sf.text, chosen.flatMap((p) => p.edits));
            if (chosen.length === 0 || !compiles(next)) {
                for (const p of chosen) rejectedNow[p.key] = 'result-did-not-compile';
                continue;
            }
        }
        applied += chosen.length;
        for (const p of chosen) report.inlined.push({ key: p.key, kind: p.kind, round });
        if (!dry) {
            fs.writeFileSync(file, next);
            versions.set(file, (versions.get(file) ?? 0) + 1);
            changedFiles.push(relFile);
        }
    }
    report.rejected = rejectedNow;
    report.rounds.push({ round, applied, files: changedFiles.length });
    console.log(`round ${round}: inlined ${applied} in ${changedFiles.length} files; ${Object.keys(rejectedNow).length} left`);
    if (applied === 0 || dry) break;
}
const reasons = {};
for (const r of Object.values(report.rejected)) reasons[r] = (reasons[r] ?? 0) + 1;
report.reasons = reasons;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.table(Object.entries(reasons).sort((a, b) => b[1] - a[1]));
console.log('total inlined', report.inlined.length, 'by kind', report.inlined.reduce((m, x) => ((m[x.kind] = (m[x.kind] ?? 0) + 1), m), {}));
