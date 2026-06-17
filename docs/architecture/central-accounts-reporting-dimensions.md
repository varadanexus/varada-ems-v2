# VARADA EMS 2.0 – Central Accounts Reporting Dimension Architecture

## 1. Purpose
This document defines the launch architecture for Central Accounts reporting dimensions.

Frozen launch dimensions:
- Division
- Counterparty
- Project
- Profit Center

---

## 2. Ownership
- business owner: CFO / Reporting governance
- operational owner: Accounts Manager / future reporting governance support

---

## 3. Purpose of reporting dimensions
- preserve multi-division visibility without separate accounting silos
- enable enterprise reporting from one COA
- support profitability analysis
- support document traceability and management drill-down

---

## 4. Lifecycle
- defined
- active
- deprecated
- retired

Retired dimensions remain historically referenceable for posted journals.

---

## 5. Dimension architecture

## 5.1 Division

### Purpose
- identifies the originating business division

### Relationships
- attached to financial documents and journal lines

### Security considerations
- supports controlled visibility and reporting segmentation

### Future expansion notes
- may later support sub-division / region if approved

---

## 5.2 Counterparty

### Purpose
- identifies the customer / transporter / vendor / contractor / consultant / marketplace counterparty

### Relationships
- attached to relevant financial documents and journal lines

### Security considerations
- sensitive commercial data; must remain finance-controlled

### Future expansion notes
- counterparty group / cluster analytics

---

## 5.3 Project

### Purpose
- identifies project-based activity for Construction, Hospital Projects, Consultancy, and future relevant flows

### Relationships
- attached where source documents originate from a project context

### Security considerations
- project visibility may become sensitive in cross-division contexts

### Future expansion notes
- milestone / site / project-phase breakdowns

---

## 5.4 Profit Center

### Purpose
- provides management profitability slicing beyond the division boundary

### Relationships
- may be attached to journals and document families based on business mapping rules

### Security considerations
- managerial reporting sensitivity; should not drive unauthorized mutation access

### Future expansion notes
- route/product/channel/customer-segment mapping into profit-center frameworks

---

## 6. Relationships
- dimensions enrich `journal_lines`
- source documents provide default dimension values
- reporting uses dimensions to derive profitability, contribution, and drill-down views

---

## 7. Security considerations
- dimension changes can alter reporting truth
- dimension governance must be restricted
- historic posted lines must not lose their dimensional context

---

## 8. Future expansion notes
- geography
- channel
- product/service line
- route / shipment / location dimensions

---

## 9. Open decisions list
- Whether Project and Profit Center should always be optional at launch or mandatory for certain divisions from Phase 1.
- Whether Counterparty should split into customer-side and supplier-side sub-dimensions later.
