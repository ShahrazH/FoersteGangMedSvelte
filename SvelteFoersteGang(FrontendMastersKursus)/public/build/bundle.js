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
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
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

/* src\Button.svelte generated by Svelte v3.31.0 */

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
	const click_handler = () => console.log("Nice click bro!");
	return [click_handler];
}

class Button extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, {});
	}
}

/* src\TestComponent.svelte generated by Svelte v3.31.0 */

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

	return {
		c() {
			h1 = element("h1");
			h1.textContent = "Nedstående er skrevet med props. Eksporteret fra et component til forsiden";
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
			t8 = text(/*test*/ ctx[3]);
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
		},
		p(ctx, [dirty]) {
			if (dirty & /*dette*/ 1) set_data(t2, /*dette*/ ctx[0]);
			if (dirty & /*er*/ 2) set_data(t4, /*er*/ ctx[1]);
			if (dirty & /*en*/ 4) set_data(t6, /*en*/ ctx[2]);
			if (dirty & /*test*/ 8) set_data(t8, /*test*/ ctx[3]);
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
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { dette } = $$props;
	let { er } = $$props;
	let { en } = $$props;
	let { test } = $$props;

	$$self.$$set = $$props => {
		if ("dette" in $$props) $$invalidate(0, dette = $$props.dette);
		if ("er" in $$props) $$invalidate(1, er = $$props.er);
		if ("en" in $$props) $$invalidate(2, en = $$props.en);
		if ("test" in $$props) $$invalidate(3, test = $$props.test);
	};

	return [dette, er, en, test];
}

class TestComponent extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, { dette: 0, er: 1, en: 2, test: 3 });
	}
}

/* src\App.svelte generated by Svelte v3.31.0 */

function create_fragment$2(ctx) {
	let h1;
	let t0;
	let t1;
	let t2;
	let t3;
	let h2;
	let t4;
	let t5;
	let t6;
	let testcomponent;
	let t7;
	let button;
	let current;

	testcomponent = new TestComponent({
			props: {
				dette: /*test*/ ctx[2].ord1,
				er: /*test*/ ctx[2].ord2,
				en: /*test*/ ctx[2].ord3,
				test: /*test*/ ctx[2].ord4
			}
		});

	button = new Button({});

	return {
		c() {
			h1 = element("h1");
			t0 = text("Hello ");
			t1 = text(/*name*/ ctx[0]);
			t2 = text("!");
			t3 = space();
			h2 = element("h2");
			t4 = text("The day is ");
			t5 = text(/*day*/ ctx[1]);
			t6 = space();
			create_component(testcomponent.$$.fragment);
			t7 = space();
			create_component(button.$$.fragment);
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
			mount_component(testcomponent, target, anchor);
			insert(target, t7, anchor);
			mount_component(button, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			if (!current || dirty & /*name*/ 1) set_data(t1, /*name*/ ctx[0]);
			if (!current || dirty & /*day*/ 2) set_data(t5, /*day*/ ctx[1]);
		},
		i(local) {
			if (current) return;
			transition_in(testcomponent.$$.fragment, local);
			transition_in(button.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(testcomponent.$$.fragment, local);
			transition_out(button.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(h1);
			if (detaching) detach(t3);
			if (detaching) detach(h2);
			if (detaching) detach(t6);
			destroy_component(testcomponent, detaching);
			if (detaching) detach(t7);
			destroy_component(button, detaching);
		}
	};
}

function instance$2($$self, $$props, $$invalidate) {
	let { name } = $$props;
	let { day } = $$props;

	const test = {
		ord1: "dette",
		ord2: "er",
		ord3: "en",
		ord4: "test"
	};

	$$self.$$set = $$props => {
		if ("name" in $$props) $$invalidate(0, name = $$props.name);
		if ("day" in $$props) $$invalidate(1, day = $$props.day);
	};

	return [name, day, test];
}

class App extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$2, create_fragment$2, safe_not_equal, { name: 0, day: 1 });
	}
}

new App({
    target: document.body,
    props: {
        name: 'world',
        day: "today"
    }
});
//# sourceMappingURL=bundle.js.map
