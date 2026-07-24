# Spec: Authorization E2E Tests

## R1: /auth/me report window
- **R1.1**: SuperAdmin → IsSuperAdmin=true
- **R1.2**: OwnerAdmin with Management(7) store → IsOwnerAdmin=true, FeatureIds contains Stores(73)
- **R1.3**: OwnerAdmin without Management store → IsOwnerAdmin=true, FeatureIds excludes Stores(73)
- **R1.4**: StoreUser with feature → IsSuperAdmin=false, IsOwnerAdmin=false, SelectedStoreId matches
- **R1.5**: ReSeller → IsReSeller=true
- **R1.6**: UserRole tenant mismatch → IsOwnerAdmin=false (not recognized)

## R2: Stores enforcement window
- **R2.1**: No token → 401
- **R2.2**: SuperAdmin → passes read (200)
- **R2.3**: SuperAdmin → can approve (200)
- **R2.4**: OwnerAdmin with feature → passes read (200), approve → 403
- **R2.5**: OwnerAdmin without Management → 403
- **R2.6**: StoreUser with feature → passes (200)
- **R2.7**: StoreUser without feature → 403
- **R2.8**: ReSeller → 403
- **R2.9**: Tenant mismatch → 403

## R3: Store-scoping
- **R3.1**: SetMyStore changes SelectedStoreId and /me recomputes

## R4: Usages smoke
- **R4.1**: POST store-daily-usage → 200 for SuperAdmin