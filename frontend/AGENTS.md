# AGENTS.md - Store Management Frontend

## Project Overview

Angular 21 application with TypeScript, SCSS, and Jasmine/Karma testing. Uses Angular Material and ng-zorro-antd UI libraries.

## Build/Lint/Test Commands

```bash
# Development
npm start              # Start dev server (ng serve)
npm run watch          # Build with watch mode

# Build
npm run build          # Build for production
npm run build-prod     # Production build with base-href

# Testing
npm run test           # Run all tests (Karma + Jasmine)
npm run test -- --include="**/filename.spec.ts"  # Run single test file
npm run test -- --single-run  # Run tests once (CI mode)

# Linting
npm run lint           # Run ESLint
npm run lint-fix       # Run ESLint with auto-fix
```

## Code Style Guidelines

### General

- **No comments** unless explicitly requested by user
- Use strict TypeScript mode (enabled in tsconfig.json)
- Follow Angular best practices and style guide

### Naming Conventions

- **Components/Directives/Pipes**: kebab-case in templates, e.g., `app-user-list`
- **Classes/Types/Interfaces**: PascalCase, e.g., `UserService`, `UserModel`
- **Variables/Methods**: camelCase, e.g., `getUsers()`, `isActive`
- **Constants**: UPPER_SNAKE_CASE for config values, camelCase for service constants
- **Files**: kebab-case, e.g., `user-list.component.ts`, `user.service.ts`

### Component Structure

```typescript
// Recommended order:
1. @Injectable decorators
2. @Component/@Directive/@Pipe decorators
3. Class declarations
4. @Input/@Output properties
5. ViewChild/ContentChild
6. Lifecycle hooks
7. Public methods
8. Private methods
```

### Imports

- Order imports: Angular > External > Internal (relative paths)
- Use absolute imports for app modules: `import { UserService } from '@app/services/user.service'`

### Templates

- Use strict template type checking (`strictTemplates: true`)
- Avoid `any` type; use proper types or `unknown`
- Prefer `*ngIf` and `*ngFor` over `[hidden]` or manual DOM manipulation

### TypeScript

- Enable strict mode rules:
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`
  - `noPropertyAccessFromIndexSignature: true`
  - `noImplicitOverride: true`
- Use interfaces over types for object shapes
- Use `readonly` for immutable properties

### Error Handling

- Use proper error types; avoid `any` in catch blocks
- Handle errors at service level; display user-friendly messages in components
- Use Angular's `ErrorHandler` for global error handling

### CSS/SCSS

- Use SCSS with variables and mixins from existing patterns
- Follow BEM-like naming for custom CSS classes
- Use Angular Material/ng-zorro components when available
- Keep component styles scoped (use `::ng-deep` sparingly, only for overriding third-party styles)

### State Management

- Use services with BehaviorSubject for simple state
- Follow unidirectional data flow pattern

### Git Conventions

- Use meaningful commit messages
- Don't commit secrets or environment files with actual credentials
- Run `npm run lint` and ensure tests pass before committing

## Project Structure

```
src/
├── app/
│   ├── core/           # Singleton services, guards, interceptors
│   ├── shared/         # Shared components, pipes, directives
│   ├── features/       # Feature modules (grouped by domain)
│   └── layouts/        # Layout components
├── assets/             # Static assets
├── environments/       # Environment configs
└── scss/               # Global SCSS files
```

## Additional Notes

- This is an Angular 21 project (cutting edge)
- Uses `zone.js` for change detection
- Default component prefix: `app`
- Browser support includes modern browsers (es2022 target)

## Barcode Scanner

The app includes barcode scanning functionality using `@zxing/browser`.

### Supported Barcode Formats

- EAN-13 (retail products)
- EAN-8 (small products)
- UPC-A (US products)
- UPC-E (small US products)
- Code 128 (inventory)
- Code 39 (industrial)
- QR Code

### Components

- `BarcodeScannerComponent`: Reusable scanner modal for products
- `QuickSaleScannerComponent`: Persistent scanner for sales (remains open for multiple scans)

### Usage

```typescript
// In a component
import { QuickSaleScannerComponent } from './sale/quick-sale-scanner/quick-sale-scanner.component';

@Component({
  imports: [QuickSaleScannerComponent],
  template: ` <app-quick-sale-scanner (barcodeScanned)="onBarcodeScanned($event)" (closed)="onScannerClosed()"> </app-quick-sale-scanner> `
})
export class SaleComponent {
  onBarcodeScanned(barcode: string) {
    // Search product by barcode and add to cart
  }
}
```

### Product Model

The `Product` interface includes optional `barcode` field:

```typescript
export interface Product extends AuditableBaseModel {
  id: string;
  name: string;
  barcode?: string;
  // ... other fields
}
```
