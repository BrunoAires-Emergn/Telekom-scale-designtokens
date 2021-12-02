const fs = require('fs-extra');
const deep = require('deep-get-set');
const StyleDictionary = require('style-dictionary');
const {
  OUTPUT_PATH,
  FIGMA_KEY_LIGHT,
  FIGMA_KEY_DARK,
  figmaCase,
} = require('./shared');

const figmaTransformGroup = ['attribute/cti'];

function formatJSON(allTokens, nameCaseFn = figmaCase) {
  const output = {};
  deep.p = true;
  allTokens.forEach((token) => {
    const path = token.path.map(nameCaseFn);
    if (path[0] === 'Semantic') path.shift(); // TODO remove after removing `semantic` key in source
    if (path[0] === 'Color' || path[0] === 'Elevation') path.shift();
    deep(output, path, getJSONValue(token));
  });
  return output;
}

const categoryTypeMap = {
  'line-weight': 'borderWidth',
  opacity: 'opacity',
  radius: 'borderRadius',
  shadow: 'boxShadow',
  spacing: 'spacing',
  textStyle: 'typography',
};

/**
 * Handle some special cases
 */
function getJSONValue(token) {
  const attributes = {
    type: token.type,
  };
  if (token.comment) {
    attributes.description = token.comment;
  }
  if (token.type === 'textStyle') {
    attributes.type = categoryTypeMap['textStyle'];
  }
  if (token.type === 'shadow') {
    attributes.type = categoryTypeMap['shadow'];
  }
  if (token.path.includes('line-weight')) {
    attributes.type = categoryTypeMap['line-weight'];
  }
  if (token.path.includes('opacity')) {
    attributes.type = categoryTypeMap['opacity'];
  }
  if (token.path.includes('radius')) {
    attributes.type = categoryTypeMap['radius'];
  }
  if (token.path.includes('spacing')) {
    attributes.type = categoryTypeMap['spacing'];
  }

  return {
    value: token.value,
    ...attributes,
  };
}

// StyleDictionary.registerTransform({
//   type: 'value',
//   name: 'shadow/figma',
//   // TODO remove `elevation` in path check?
//   matcher: (token) =>
//     token.original.type === 'shadow' || token.path.includes('elevation'),
//   transformer: function (token) {
//     const { value } = token.original;
//     const transform = (x) => ({
//       ...x,
//     });
//     return Array.isArray(value) ? value.map(transform) : transform(value);
//   },
// });

StyleDictionary.registerFormat({
  name: 'json/figma',
  formatter: function ({ dictionary }) {
    const output = formatJSON(dictionary.allTokens);
    return JSON.stringify(output, null, 2);
  },
});

StyleDictionary.registerFormat({
  name: 'json/figma-mode',
  formatter: function ({ dictionary }) {
    const output = formatJSON(
      dictionary.allTokens.filter(
        (token) =>
          token.path.includes('color') || token.path.includes('elevation')
      )
    );
    return JSON.stringify(output, null, 2);
  },
});

StyleDictionary.registerAction({
  name: 'bundle_figma',
  do: async function (dictionary, config) {
    // TODO get these from `config`?
    const COMMON_PATH = OUTPUT_PATH + 'figma/';
    const modeless = JSON.parse(
      await fs.readFile(COMMON_PATH + 'tokens.modeless.json')
    );
    const light = JSON.parse(
      await fs.readFile(COMMON_PATH + 'tokens.light.json')
    );
    const dark = JSON.parse(
      await fs.readFile(COMMON_PATH + 'tokens.dark.json')
    );
    const output = {
      [FIGMA_KEY_LIGHT]: { ...light },
      [FIGMA_KEY_DARK]: { ...dark },
      ...modeless,
    };
    await fs.writeFile(
      COMMON_PATH + 'tokens.json',
      JSON.stringify(output, null, 2)
    );
    await fs.remove(COMMON_PATH + 'tokens.modeless.json');
    await fs.remove(COMMON_PATH + 'tokens.light.json');
    await fs.remove(COMMON_PATH + 'tokens.dark.json');
  },
  undo: async function () {
    const COMMON_PATH = OUTPUT_PATH + 'json/';
    await fs.rm(COMMON_PATH + 'tokens.json');
  },
});

module.exports = {
  source: ['src/**/*.json5'],
  platforms: {
    figmaModeless: {
      transforms: [...figmaTransformGroup],
      buildPath: OUTPUT_PATH + 'figma/',
      files: [
        {
          destination: 'tokens.modeless.json',
          format: 'json/figma',
          filter: (token) => {
            if (token.path[0] === 'core') return false;
            if (token.path[0] === 'semantic' && token.path[1] === 'color')
              return false;
            if (token.path[0] === 'semantic' && token.path[1] === 'elevation')
              return false;
            if (token.path[0] === 'semantic' && token.path[1] === 'motion')
              return false;
            return true;
          },
        },
      ],
    },
    figmaLight: {
      transforms: ['mode-light', ...figmaTransformGroup],
      buildPath: OUTPUT_PATH + 'figma/',
      files: [
        {
          destination: 'tokens.light.json',
          format: 'json/figma-mode',
          filter: (token) => {
            return (
              token.path[0] === 'semantic' &&
              (token.path[1] === 'color' || token.path[1] === 'elevation')
            );
          },
          options: {
            outputReferences: true,
          },
        },
      ],
    },
    figmaDark: {
      transforms: ['mode-dark', ...figmaTransformGroup],
      buildPath: OUTPUT_PATH + 'figma/',
      files: [
        {
          destination: 'tokens.dark.json',
          format: 'json/figma-mode',
          filter: (token) => {
            return (
              token.path[0] === 'semantic' &&
              (token.path[1] === 'color' || token.path[1] === 'elevation')
            );
          },
          options: {
            outputReferences: true,
          },
        },
      ],
      actions: ['bundle_figma'],
    },
  },
};