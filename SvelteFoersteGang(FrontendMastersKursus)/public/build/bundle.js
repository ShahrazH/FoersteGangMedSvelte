function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_data(text, data) {
    data = '' + data;
    if (text.wholeText !== data)
        text.data = data;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
// TODO figure out if we still want to support
// shorthand events, or if we want to implement
// a real bubbling mechanism
function bubble(component, event) {
    const callbacks = component.$$.callbacks[event.type];
    if (callbacks) {
        callbacks.slice().forEach(fn => fn(event));
    }
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
let flushing = false;
const seen_callbacks = new Set();
function flush() {
    if (flushing)
        return;
    flushing = true;
    do {
        // first, call beforeUpdate functions
        // and update components
        for (let i = 0; i < dirty_components.length; i += 1) {
            const component = dirty_components[i];
            set_current_component(component);
            update(component.$$);
        }
        set_current_component(null);
        dirty_components.length = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    flushing = false;
    seen_callbacks.clear();
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
}
function create_component(block) {
    block && block.c();
}
function mount_component(component, target, anchor) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    // onMount happens before the initial afterUpdate
    add_render_callback(() => {
        const new_on_destroy = on_mount.map(run).filter(is_function);
        if (on_destroy) {
            on_destroy.push(...new_on_destroy);
        }
        else {
            // Edge case - component was destroyed immediately,
            // most likely as a result of a binding initialising
            run_all(new_on_destroy);
        }
        component.$$.on_mount = [];
    });
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const prop_values = options.props || {};
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, prop_values, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor);
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* src\components\Button.svelte generated by Svelte v3.31.0 */

function create_fragment(ctx) {
	let button;
	let mounted;
	let dispose;

	return {
		c() {
			button = element("button");
			button.textContent = "Click and check the console!";
			attr(button, "class", "svelte-1qwu7sn");
		},
		m(target, anchor) {
			insert(target, button, anchor);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler*/ ctx[0]);
				mounted = true;
			}
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

function instance($$self) {
	function click_handler(event) {
		bubble($$self, event);
	}

	return [click_handler];
}

class Button extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, {});
	}
}

/* src\components\PropTest.svelte generated by Svelte v3.31.0 */

function create_fragment$1(ctx) {
	let h1;
	let t1;
	let p0;
	let t2;
	let t3;
	let p1;
	let t4;
	let t5;
	let p2;
	let t6;
	let t7;
	let p3;
	let t8;
	let t9;
	let p4;
	let t10;

	return {
		c() {
			h1 = element("h1");
			h1.textContent = "Nedstående er skrevet med props. Eksporteret fra et andet component til\r\n    forsiden";
			t1 = space();
			p0 = element("p");
			t2 = text(/*dette*/ ctx[0]);
			t3 = space();
			p1 = element("p");
			t4 = text(/*er*/ ctx[1]);
			t5 = space();
			p2 = element("p");
			t6 = text(/*en*/ ctx[2]);
			t7 = space();
			p3 = element("p");
			t8 = text(/*prop*/ ctx[3]);
			t9 = space();
			p4 = element("p");
			t10 = text(/*test*/ ctx[4]);
		},
		m(target, anchor) {
			insert(target, h1, anchor);
			insert(target, t1, anchor);
			insert(target, p0, anchor);
			append(p0, t2);
			insert(target, t3, anchor);
			insert(target, p1, anchor);
			append(p1, t4);
			insert(target, t5, anchor);
			insert(target, p2, anchor);
			append(p2, t6);
			insert(target, t7, anchor);
			insert(target, p3, anchor);
			append(p3, t8);
			insert(target, t9, anchor);
			insert(target, p4, anchor);
			append(p4, t10);
		},
		p(ctx, [dirty]) {
			if (dirty & /*dette*/ 1) set_data(t2, /*dette*/ ctx[0]);
			if (dirty & /*er*/ 2) set_data(t4, /*er*/ ctx[1]);
			if (dirty & /*en*/ 4) set_data(t6, /*en*/ ctx[2]);
			if (dirty & /*prop*/ 8) set_data(t8, /*prop*/ ctx[3]);
			if (dirty & /*test*/ 16) set_data(t10, /*test*/ ctx[4]);
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(h1);
			if (detaching) detach(t1);
			if (detaching) detach(p0);
			if (detaching) detach(t3);
			if (detaching) detach(p1);
			if (detaching) detach(t5);
			if (detaching) detach(p2);
			if (detaching) detach(t7);
			if (detaching) detach(p3);
			if (detaching) detach(t9);
			if (detaching) detach(p4);
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { dette } = $$props;
	let { er } = $$props;
	let { en } = $$props;
	let { prop } = $$props;
	let { test } = $$props;

	$$self.$$set = $$props => {
		if ("dette" in $$props) $$invalidate(0, dette = $$props.dette);
		if ("er" in $$props) $$invalidate(1, er = $$props.er);
		if ("en" in $$props) $$invalidate(2, en = $$props.en);
		if ("prop" in $$props) $$invalidate(3, prop = $$props.prop);
		if ("test" in $$props) $$invalidate(4, test = $$props.test);
	};

	return [dette, er, en, prop, test];
}

class PropTest extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, { dette: 0, er: 1, en: 2, prop: 3, test: 4 });
	}
}

/* src\components\Array.svelte generated by Svelte v3.31.0 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[0] = list[i];
	return child_ctx;
}

// (13:0) {#each ord as ord}
function create_each_block(ctx) {
	let ul;
	let li;
	let t0_value = /*ord*/ ctx[0].ord + "";
	let t0;
	let t1;

	return {
		c() {
			ul = element("ul");
			li = element("li");
			t0 = text(t0_value);
			t1 = space();
		},
		m(target, anchor) {
			insert(target, ul, anchor);
			append(ul, li);
			append(li, t0);
			append(ul, t1);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(ul);
		}
	};
}

function create_fragment$2(ctx) {
	let h2;
	let t1;
	let each_1_anchor;
	let each_value = /*ord*/ ctx[0];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			h2 = element("h2");
			h2.textContent = "Liste af Random ord fra et array. Listen bliver generet for hvert ord";
			t1 = space();

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		m(target, anchor) {
			insert(target, h2, anchor);
			insert(target, t1, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert(target, each_1_anchor, anchor);
		},
		p(ctx, [dirty]) {
			if (dirty & /*ord*/ 1) {
				each_value = /*ord*/ ctx[0];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(h2);
			if (detaching) detach(t1);
			destroy_each(each_blocks, detaching);
			if (detaching) detach(each_1_anchor);
		}
	};
}

function instance$2($$self) {
	let ord = [
		{ ord: "Kage" },
		{ ord: "Goldenrod" },
		{ ord: "Random" },
		{ ord: "HMTL" },
		{ ord: "HEJ" }
	];

	return [ord];
}

class Array$1 extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
	}
}

/* src\components\Click.svelte generated by Svelte v3.31.0 */

function create_else_block(ctx) {
	let p;
	let t0;
	let t1;
	let t2;

	return {
		c() {
			p = element("p");
			t0 = text("Du er på ");
			t1 = text(/*count*/ ctx[0]);
			t2 = text(" click - Kan du nå op på 20?");
		},
		m(target, anchor) {
			insert(target, p, anchor);
			append(p, t0);
			append(p, t1);
			append(p, t2);
		},
		p(ctx, dirty) {
			if (dirty & /*count*/ 1) set_data(t1, /*count*/ ctx[0]);
		},
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

// (17:23) 
function create_if_block_1(ctx) {
	let p;
	let t0;
	let t1;
	let t2;

	return {
		c() {
			p = element("p");
			t0 = text("Du har klikket\r\n        ");
			t1 = text(/*count*/ ctx[0]);
			t2 = text("\r\n        gange nu. Der er lidt vej til de 20. Du kan tage en pause eller\r\n        forstætte, det er op til dig.");
		},
		m(target, anchor) {
			insert(target, p, anchor);
			append(p, t0);
			append(p, t1);
			append(p, t2);
		},
		p(ctx, dirty) {
			if (dirty & /*count*/ 1) set_data(t1, /*count*/ ctx[0]);
		},
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

// (15:0) {#if count === 20}
function create_if_block(ctx) {
	let p;
	let t0;
	let t1;
	let t2;

	return {
		c() {
			p = element("p");
			t0 = text("Ja, det var så de ");
			t1 = text(/*count*/ ctx[0]);
			t2 = text(" klik, godt gået? tror jeg..");
		},
		m(target, anchor) {
			insert(target, p, anchor);
			append(p, t0);
			append(p, t1);
			append(p, t2);
		},
		p(ctx, dirty) {
			if (dirty & /*count*/ 1) set_data(t1, /*count*/ ctx[0]);
		},
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

function create_fragment$3(ctx) {
	let t0;
	let button;
	let t1;
	let t2;
	let t3;
	let t4_value = (/*count*/ ctx[0] === 1 ? "gang" : "gange") + "";
	let t4;
	let mounted;
	let dispose;

	function select_block_type(ctx, dirty) {
		if (/*count*/ ctx[0] === 20) return create_if_block;
		if (/*count*/ ctx[0] === 10) return create_if_block_1;
		return create_else_block;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);

	return {
		c() {
			if_block.c();
			t0 = space();
			button = element("button");
			t1 = text("Du har klikket\r\n    ");
			t2 = text(/*count*/ ctx[0]);
			t3 = space();
			t4 = text(t4_value);
			attr(button, "class", "svelte-9dw05k");
		},
		m(target, anchor) {
			if_block.m(target, anchor);
			insert(target, t0, anchor);
			insert(target, button, anchor);
			append(button, t1);
			append(button, t2);
			append(button, t3);
			append(button, t4);

			if (!mounted) {
				dispose = listen(button, "click", /*click*/ ctx[1]);
				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(t0.parentNode, t0);
				}
			}

			if (dirty & /*count*/ 1) set_data(t2, /*count*/ ctx[0]);
			if (dirty & /*count*/ 1 && t4_value !== (t4_value = (/*count*/ ctx[0] === 1 ? "gang" : "gange") + "")) set_data(t4, t4_value);
		},
		i: noop,
		o: noop,
		d(detaching) {
			if_block.d(detaching);
			if (detaching) detach(t0);
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

function instance$3($$self, $$props, $$invalidate) {
	let count = 0;

	function click() {
		$$invalidate(0, count += 1);
	}

	return [count, click];
}

class Click extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
	}
}

/* src\App.svelte generated by Svelte v3.31.0 */

function create_fragment$4(ctx) {
	let h1;
	let t0;
	let t1;
	let t2;
	let t3;
	let h2;
	let t4;
	let t5;
	let t6;
	let proptest;
	let t7;
	let button;
	let t8;
	let array;
	let t9;
	let click;
	let current;

	proptest = new PropTest({
			props: {
				dette: /*props*/ ctx[2].ord1,
				er: /*props*/ ctx[2].ord2,
				en: /*props*/ ctx[2].ord3,
				prop: /*props*/ ctx[2].ord4,
				test: /*props*/ ctx[2].ord5
			}
		});

	button = new Button({});
	button.$on("click", /*click_handler*/ ctx[3]);
	array = new Array$1({});
	click = new Click({});

	return {
		c() {
			h1 = element("h1");
			t0 = text("Hello ");
			t1 = text(/*name*/ ctx[0]);
			t2 = text("!");
			t3 = space();
			h2 = element("h2");
			t4 = text("I dag er det den ");
			t5 = text(/*day*/ ctx[1]);
			t6 = space();
			create_component(proptest.$$.fragment);
			t7 = space();
			create_component(button.$$.fragment);
			t8 = space();
			create_component(array.$$.fragment);
			t9 = space();
			create_component(click.$$.fragment);
		},
		m(target, anchor) {
			insert(target, h1, anchor);
			append(h1, t0);
			append(h1, t1);
			append(h1, t2);
			insert(target, t3, anchor);
			insert(target, h2, anchor);
			append(h2, t4);
			append(h2, t5);
			insert(target, t6, anchor);
			mount_component(proptest, target, anchor);
			insert(target, t7, anchor);
			mount_component(button, target, anchor);
			insert(target, t8, anchor);
			mount_component(array, target, anchor);
			insert(target, t9, anchor);
			mount_component(click, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			if (!current || dirty & /*name*/ 1) set_data(t1, /*name*/ ctx[0]);
			if (!current || dirty & /*day*/ 2) set_data(t5, /*day*/ ctx[1]);
		},
		i(local) {
			if (current) return;
			transition_in(proptest.$$.fragment, local);
			transition_in(button.$$.fragment, local);
			transition_in(array.$$.fragment, local);
			transition_in(click.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(proptest.$$.fragment, local);
			transition_out(button.$$.fragment, local);
			transition_out(array.$$.fragment, local);
			transition_out(click.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(h1);
			if (detaching) detach(t3);
			if (detaching) detach(h2);
			if (detaching) detach(t6);
			destroy_component(proptest, detaching);
			if (detaching) detach(t7);
			destroy_component(button, detaching);
			if (detaching) detach(t8);
			destroy_component(array, detaching);
			if (detaching) detach(t9);
			destroy_component(click, detaching);
		}
	};
}

function instance$4($$self, $$props, $$invalidate) {
	let { name } = $$props;
	let { day } = $$props;

	//Her henter definerer vi vores props som vi sætter ind i PropTest komponentet
	const props = {
		ord1: "dette",
		ord2: "er",
		ord3: "en",
		ord4: "prop",
		ord5: "test"
	};

	const click_handler = () => console.log("Nice click!");

	$$self.$$set = $$props => {
		if ("name" in $$props) $$invalidate(0, name = $$props.name);
		if ("day" in $$props) $$invalidate(1, day = $$props.day);
	};

	return [name, day, props, click_handler];
}

class App extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$4, create_fragment$4, safe_not_equal, { name: 0, day: 1 });
	}
}

let d = new Date();
let n = d.getDay();

new App({
    target: document.body,
    props: {
        name: 'world',
        day: n + "." + " dag i ugen"
    }
});
//# sourceMappingURL=bundle.js.map
