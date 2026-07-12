# Commerce Workflow Optimization Plan

## 1. AI Product Image Creative Generation

Add a generation step between product selection and listing publication. The system should use supplier images as factual references, combine them with product attributes, hot keywords, target platform style, and compliance constraints, then generate higher-quality original listing images instead of directly copying supplier images.

Target flow:

```text
1688 source images
  -> product visual analysis and selling point extraction
  -> platform-specific image prompt generation
  -> AI-generated main images, scenario images, and detail images
  -> OCR, compliance, similarity, and truthfulness checks
  -> platform image resizing/formatting through ImagePipeline
  -> upload to platform image storage
  -> attach generated image URLs to listing payloads
  -> publish and later evaluate variants through AB tests
```

Important constraints:

- Generated images must not misrepresent the product's material, size, function, certification, or brand.
- Supplier watermarks, models, brand marks, and distinctive copyrighted composition should not be retained.
- Low-confidence or compliance-risk images should require human review before listing.

## 2. Category Attribute Recognition And Platform Mapping

Add a category-aware attribute layer so products with different specification structures can be accurately parsed, normalized, validated, and filled into target platform listing forms.

Target flow:

```text
1688 product detail
  -> category classification
  -> source spec and SKU parsing
  -> internal normalized attribute model
  -> target platform category/property mapping
  -> required-field and enum validation
  -> listing payload generation
  -> publish automatically or route to manual review
```

Example category-specific attributes:

- Apparel: color, size, material, gender, season, fit.
- Shoes: size, color, upper material, closure type, sole material.
- Electronics: model, capacity, interface, power, compatible devices.
- Home goods: size, material, color, installation method.
- Beauty: net content, suitable skin type, function, shelf life.
- Food: flavor, net weight, origin, shelf life, storage method.

Required components:

- `CategoryClassifier`: infer the internal product category from source category ID, title, description, specs, SKUs, and images.
- `AttributeNormalizer`: convert source terms such as apparel size aliases, color aliases, capacity aliases, and model aliases into standard internal fields while preserving original values.
- `PlatformAttributeMapper`: map internal attributes to each platform's category properties, required fields, enum values, SKU model, and listing API payload shape.
- Confidence gating: high confidence can publish automatically, medium confidence creates a reviewable draft, low confidence blocks publishing until manually completed.

## 3. Listing Cadence And Lifecycle Automation

Define an executable operating policy for scheduled product selection, listing, monitoring, and delisting. The current repository has cron scripts for trend collection, price checks, order sync, and daily reports, but it does not yet define a quantitative rule set for daily selection volume, listing volume, listing slot budgets, probation windows, or automatic delisting.

This optimization should add:

- A scheduled selection job that ranks candidate products from trends, supplier data, margin, inventory, and compliance risk.
- A daily listing quota that adapts to available store capacity, historical success rate, and operational review bandwidth.
- A probation window for new listings, with objective thresholds for exposure, clicks, conversion, sales, margin, refund rate, and stock health.
- A delisting or pause job that removes underperforming products before they occupy scarce store listing slots for too long.
- A human-review lane for products near thresholds or with insufficient data.

Suggested initial operating policy:

- Candidate pool: evaluate `5x-10x` the daily listing quota. If the store should list 10 products per day, score 50-100 candidates.
- Daily listing quota: start with 5-10 products per day for a new store, 10-30 products per day for a stable store, or 1%-3% of active listing capacity for a mature store.
- Auto-listing threshold: total product score >= 80, gross margin >= 25%, supplier reliability >= 75, available stock covers at least 14 days, and compliance checks pass.
- Manual-review threshold: product score between 70 and 80, missing non-critical attributes, medium image-generation confidence, or incomplete platform enum mapping.
- Block threshold: product score < 70, missing required platform attributes, gross margin below 15%, major compliance risk, no source inventory, or supplier reliability below 60.
- Optimization window: if a listing has at least 300 impressions after 3 days and CTR < 0.5%, regenerate image/title variants before delisting.
- Delisting window: if a listing has at least 1,000 impressions after 7 days with no orders and CTR < 0.8%, pause or delist.
- Hard delist: if a listing has at least 2,000 impressions after 14 days with no orders, delist automatically unless manually protected.
- Conversion warning: if clicks >= 100 and conversion rate < 0.3%, pause and review price, detail page, reviews, and fulfillment promise.
- Risk stop: if refund rate > 15%, major negative review signals appear, source price changes by more than 8%, or source inventory becomes insufficient, pause immediately and notify operations.

Required components:

- `ProductLifecyclePolicy`: stores configurable thresholds by platform, category, store maturity, and listing capacity.
- `SelectionScheduler`: runs daily candidate scoring and creates listing tasks up to the configured quota.
- `ListingPerformanceEvaluator`: joins impressions, clicks, orders, refunds, inventory, and margin to classify products as keep, optimize, pause, or delist.
- `DelistingExecutor`: calls platform `delist` or sale-status APIs and updates internal product/listing task status.
- `ProtectedListingRules`: prevents auto-delisting for strategic products, paid campaign products, seasonal products before their sales window, or manually pinned products.

## 4. End-To-End Listing Orchestration API

Create a single backend entry point that turns selected source products into publishable listings. The current repository has separate modules for 1688 sourcing, AI content generation, image processing, listing orchestration, and platform clients, but the user-facing "generate content and list" action is not yet wired into one durable workflow.

Target flow:

```text
selected source product IDs
  -> fetch latest source product detail, supplier info, price, and inventory
  -> score product and check compliance
  -> normalize category attributes and platform mappings
  -> generate title, description, images, and SKU payloads
  -> create listing_tasks records
  -> publish through platform APIs or RPA fallback
  -> persist external listing IDs and status transitions
```

Required components:

- `POST /api/listings/publish`: accepts source product IDs, target platforms, quota policy, and review mode.
- Durable job queue: every platform listing attempt should be retryable, idempotent, and observable.
- Listing status model: track `pending`, `generating_content`, `generating_images`, `validating_attributes`, `uploading_images`, `listing`, `live`, `review_required`, `error`, and `dead_letter`.
- Idempotency keys: prevent duplicate listings when the same selected product is submitted more than once.
- Operator audit trail: record who or what created, approved, published, paused, or delisted each listing.

## 5. Supplier Reliability And Fallback Sourcing

Add supplier lifecycle management so the system does not depend on a single source supplier after a product is listed. This improves fulfillment stability and avoids profitable listings failing because one supplier changes price, runs out of stock, or ships slowly.

This optimization should add:

- Supplier scorecards based on response rate, dispute rate, shipping punctuality, refund/return outcomes, cooperation count, source price volatility, and inventory stability.
- Alternative supplier matching for each successful product, stored as ranked backup sources.
- Automatic supplier switch recommendations when source inventory is low, price increases beyond threshold, shipping performance drops, or dispute risk rises.
- Fulfillment guardrails that pause listings when no reliable supplier can fulfill the advertised SKU.
- Supplier-level blacklist and whitelist controls.

Suggested rules:

- Require at least 1 backup supplier for products with daily sales >= 3.
- Require at least 2 backup suppliers for products with daily sales >= 10 or campaign traffic.
- Trigger supplier review when source price rises by > 8%, stock falls below 7 days of expected sales, or promised shipping time doubles.
- Pause listing if all suppliers fail stock, margin, or compliance checks.

## 6. Data Provenance, Confidence, And Human Review

Track where every important product decision came from and how confident the system is. This is important because real ecommerce automation often fails at the edges: incomplete supplier data, ambiguous specs, generated images, platform enum mismatches, and noisy trend signals.

This optimization should add:

- `sourceType` and `confidence` fields for category, attributes, images, title, description, price, inventory, and compliance results.
- A review queue for medium-confidence listings, blocked listings, and high-value listings before publication.
- Diff views that show source supplier data, normalized internal data, generated content, and final platform payload side by side.
- Evidence retention for future debugging: source URLs, raw specs, prompt inputs, generated outputs, API responses, and validation errors.
- Review outcomes that feed back into normalization rules, prompt templates, category mappings, and lifecycle thresholds.

Suggested confidence gates:

- Auto-publish only if category, required attributes, price, inventory, and compliance confidence are all high.
- Require review if any required attribute is inferred rather than directly mapped.
- Block publish if evidence is missing for a regulated or brand-sensitive category.

## 7. Platform Capability Matrix And RPA Fallback Governance

Maintain a platform capability matrix so the system knows whether each operation should use an official API, a mock client, or browser automation fallback. This prevents the workflow from assuming a platform integration is production-ready when only part of it exists.

The matrix should track:

- Product create, update, delist, stock update, price update, image upload, category property query, order sync, shipment, aftersale sync, and analytics sync.
- Current support level per platform: `official_api`, `rpa_fallback`, `mock_only`, `manual_only`, or `unsupported`.
- Credential readiness, rate limits, required scopes, and last successful API call.
- Fallback eligibility: which actions are safe for RPA and which require manual confirmation.

Suggested rules:

- Do not auto-publish through a `mock_only` platform client.
- Use RPA fallback only for low-volume or manually approved listings.
- Require screenshots, trace logs, and post-submit verification for every RPA listing.
- Disable a platform route automatically after repeated authentication, captcha, or form-change failures.

## 8. Profit, Pricing, And Promotion Guardrails

Add a margin-safe pricing layer before listing and during the product lifecycle. A product should not be listed just because it has trend demand; it must still survive platform fees, shipping, promotion discounts, refunds, and supplier price changes.

This optimization should add:

- Full landed cost model: source price, domestic shipping, platform fee, payment fee, ad allowance, coupon budget, expected refund cost, packaging, and service cost.
- Minimum margin rules by category and platform.
- Dynamic repricing when source cost, competitor price, conversion, inventory, or campaign strategy changes.
- Promotion eligibility checks so coupons or discounts cannot accidentally push a product below margin floor.
- Price history and reason codes for every price update.

Suggested rules:

- Default minimum gross margin: 25%.
- Block listing if expected net margin after platform fees and promotions is below 15%.
- Reprice or pause if supplier cost increases by more than 8%.
- Avoid paid promotion unless contribution margin remains positive after projected ad cost.

## 9. Post-Listing Experimentation And Learning Loop

Use controlled variants to improve listings after launch instead of treating publication as the end of the workflow. The existing AB test module already supports variants with `title`, `imageUrl`, `description`, and metrics; this should be connected to listing lifecycle decisions.

This optimization should add:

- Automatic creation of title/image/detail variants for new listings.
- Traffic or time-based variant rotation where the platform supports it.
- Winner selection based on CTR, conversion rate, refund rate, and profit, not clicks alone.
- Winning content promotion back into the canonical product listing.
- Prompt and rule learning: winning variants should influence future title templates, image prompts, and category playbooks.

Suggested rules:

- Generate 2-3 variants for high-potential products before listing.
- Evaluate variants after at least 500 impressions or 7 days, whichever comes later.
- Promote a winner only when it has at least 20% lift and no worse refund/complaint signal.
- If all variants underperform, route the product to lifecycle optimization or delisting.

## 10. Observability, Alerts, And Operations Dashboard

Add production-grade visibility for the full commerce automation loop. Operators should be able to see not only sales, but also why the system selected, listed, paused, failed, or delisted a product.

This optimization should add:

- Daily funnel metrics: candidates scanned, products scored, products selected, content generated, listings created, listings live, review-required count, failures, optimizations, and delistings.
- Job-level traceability from source product ID to final platform listing ID.
- Alerting for stuck jobs, API failures, credential expiry, abnormal refund rate, price shocks, inventory risk, and sudden conversion drops.
- Category and platform breakdowns for success rate, listing failure rate, review burden, and profit.
- Operator actions for approve, reject, retry, protect listing, force delist, regenerate image, regenerate title, and switch supplier.

Suggested KPIs:

- Listing publish success rate >= 95% for official API routes.
- Attribute auto-fill accuracy >= 98% for high-confidence categories.
- Review queue SLA under 24 hours.
- Delisting decision latency under 1 day after a hard threshold is reached.
- Zero auto-publish for blocked compliance cases.
