# MIMO Admin Dashboard Backend Integration Guide

## 1. Overview

The MIMO Admin Dashboard is designed with complete decoupling between presentation and backend services. To transition from development mock data to live backend services, set:

```env
VITE_DATA_SOURCE=api
VITE_API_URL=https://api.mimo-campus.in/v1
```

---

## 2. Required REST API Endpoints

| Method | Endpoint | Description | Response Model |
|---|---|---|---|
| `GET` | `/admin/overview` | KPI summary, revenue trends, donut metrics, live pipeline | `OverviewPageData` |
| `GET` | `/admin/operations` | Real-time queue, filter parameters, dispatch stages | `OperationsPageData` |
| `GET` | `/admin/kiosks` | Kiosk fleet status, telemetry, paper & toner levels | `KiosksPageData` |
| `GET` | `/admin/incidents` | Active incidents, severity breakdowns, SLA timers | `IncidentsPageData` |
| `GET` | `/admin/analytics` | Print trends, fulfillment funnel, category distribution | `AnalyticsPageData` |
| `GET` | `/admin/finance` | Financial ledger, payment methods, settlement summary | `FinancePageData` |
| `GET` | `/admin/configuration` | Complete 7-tab configuration state | `ConfigurationState` |
| `PUT` | `/admin/configuration` | Update pricing rules, toggles, alert thresholds | `{ success: boolean }` |
| `POST` | `/admin/coupons` | Create promotional student discount codes | `PromoCoupon` |
| `DELETE` | `/admin/coupons/:id` | Revoke promo coupon code | `{ success: boolean }` |

---

## 3. Authentication & Headers

All requests include the authorization token from `localStorage.getItem('adminToken')`:
```http
Authorization: Bearer <token>
Content-Type: application/json
```
