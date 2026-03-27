# 05-01 Summary

## Outcome

- Admin default route now lands on `/admin/users?tab=list` and wildcard/legacy routes redirect into the user-first shell.
- Top-level admin navigation now uses `用户运营 / 活动兑换 / 排障中心 / 安全中心` and removes the old `模型配置` concept.
- Users workspace copy and quick actions now frame billing as pricing-only and keep redeem as a secondary workflow.

## Verification

- `npm --prefix frontend run build`
- Manual grep/inspection on `frontend/src/AdminApp.jsx`, `frontend/src/shared/lib/adminSearchParams.js`, `frontend/src/features/admin-workspaces/AdminUsersWorkspace.jsx`, and `frontend/src/features/admin-pages/AdminRedeemPage.jsx`

