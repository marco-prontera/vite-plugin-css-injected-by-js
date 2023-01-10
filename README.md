# Vite Plugin: CssInjectedByJs
A Vite plugin that takes the CSS and adds it to the page through the JS. For those who want a single JS file.

## How does it work
Essentially what it does is take all the CSS generated by the build process and add it via JavaScript.
The CSS file is therefore not generated and the declaration in the generated HTML file is also removed.
You can also configure when the CSS injection will be executed (before or after your app code).

## Installation
```
npm i vite-plugin-css-injected-by-js --save
```

## Usage
```ts
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default {
  plugins: [
    cssInjectedByJsPlugin(),
  ]
}
```
### Configurations
When you add the plugin, you can provide a configuration object.
For now, you can configure only when the injection of CSS is done at execution time ```topExecutionPriority```.
#### topExecutionPriority
The default behavior adds the injection of CSS before your bundle code.
If you provide ```topExecutionPriority``` equal to: ```false```  the code of injection will be added after the bundle code.
This is an example:
```ts
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default {
  plugins: [
    cssInjectedByJsPlugin({topExecutionPriority: false}),
  ]
}
```

#### styleId
If you provide a `string` for `styleId` param the code of injection will set the `id` attribute of the `style` element with the value of the parameter provided.
This is an example:
```ts
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default {
  plugins: [
    cssInjectedByJsPlugin({styleId: "foo"}),
  ]
}
```
The output injected into the DOM will look like this example:
```html
<head>
    <style id="foo">/* Generated CSS rules */</style>
</head>
```

#### injectCode
You can provide also a function for `injectCode` param to customize the injection code used.
The `injectCode` callback must return a `string` (with valid JS code) and it's called with two arguments:
- cssCode (the `string` that contains all the css code that need to be injected via JavaScript)
- options (a simple object that currently contains only the `styleId` param)

This is an example:
```ts
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default {
  plugins: [
    cssInjectedByJsPlugin({injectCode: (cssCode, options) => { return `try{if(typeof document != 'undefined'){var elementStyle = document.createElement('style');elementStyle.appendChild(document.createTextNode(${cssCode}));document.head.appendChild(elementStyle);}}catch(e){console.error('vite-plugin-css-injected-by-js', e);}`}}),
  ]
}
```

#### injectCodeFunction
If you prefer to specify the injectCode as a plain function you can use the `injectCodeFunction` param.

The `injectCodeFunction` function is a void function that will be called at runtime application with two arguments:
- cssCode (the `string` that contains all the css code that need to be injected via JavaScript)
- options (a simple object that currently contains only the `styleId` param)

This is an example:
```ts
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default {
    plugins: [
        cssInjectedByJsPlugin({
            injectCodeFunction: function injectCodeCustomRunTimeFunction(cssCode, options) {
                try {
                    if (typeof document != 'undefined') {
                        var elementStyle = document.createElement('style');
                        elementStyle.appendChild(document.createTextNode(${cssCode}));
                        document.head.appendChild(elementStyle);
                    }
                } catch (e) {
                    console.error('vite-plugin-css-injected-by-js', e);
                }
            }
        }),
    ]
}
```

## Contributing
When you make changes to plugin locally, you may want to build the js from the typescript file of the plugin. 
Here the guidelines:
### Install
```
npm install
```
### Build plugin
```
npm run build
```

See CONTRIBUTING.md for more information.
