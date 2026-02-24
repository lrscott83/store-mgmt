module.exports = {
  plugins: [
    require('@fullhuman/postcss-purgecss')({
      content: ['./src/**/*.html', './src/**/*.ts', './src/**/*.scss'],
      defaultExtractor: (content) => content.match(/[\w-/:]+(?<!:)/g) || [],
      safelist: {
        standard: [/^ng-/, /^mat-/, /^cdk-/, /^nb-/, /^p-/],
        deep: [/mat-mdc-/, /mat-drawer/, /mat-sidenav/, /ng-trigger/, /ng-star/]
      }
    })
  ]
};
