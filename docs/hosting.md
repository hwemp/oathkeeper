# Hosting recommendation and owner next steps

Researched November 9, 2026. The owner selected Render Free for app hosting.
MongoDB Atlas and Cloudflare R2 remain recommended supporting services.
This is not a deployed setup or a guarantee of a monthly bill below $10.

## Recommended starting services

- **Render Free web service:** run the existing Express server and React Router
  frontend together. Free services sleep after 15 idle minutes and can take about
  a minute to wake. Render describes this tier as suitable for previews and hobby
  projects, not production. Usage limits also apply.
  [Free service documentation](https://render.com/docs/free).
- **MongoDB Atlas Free:** store account records, posts, messages, and attachment
  information. The free database has 0.5 GB of storage; uploaded files should live
  in R2, separately from database records.
  [Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
- **Cloudflare R2 Standard:** store photos, videos, PDFs, and other files. The free
  allowance includes 10 GB-month of storage, one million write-class operations,
  and ten million read-class operations monthly. Additional storage is
  $0.015 per GB-month; additional requests are billed separately. Direct downloads
  have no egress charge. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

R2 supports the agreed 100 MB photos, 500 MB videos, and 1 GB other files.
Large uploads should travel directly to storage with app-authorized access and
use multipart uploads so failed parts can be retried. This is planned work.
[Upload methods](https://developers.cloudflare.com/r2/objects/upload-objects/).

Ten 1 GB files kept for a full month would consume the entire free storage
allowance. File-size limits alone cannot keep the total bill within budget.
The owner approved a 5 GB total file-storage cap and pausing uploads when full.
This cap is enforced locally; it must also apply to future cloud storage.
Budget alerts provide notifications, not a guaranteed spending ceiling.
[Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/).

## Owner next steps

The repository includes `render.yaml` to configure one free web service using
the existing Dockerfile. Automatic deployments on later commits are disabled;
updates can be deployed manually. The database connection is supplied privately
in Render, not committed to the repository.
[Render Blueprint reference](https://render.com/docs/blueprint-spec).

To deploy the current build after the accounts are ready:

1. Make sure these project changes, including `render.yaml`, are pushed to the
   Git repository connected to Render.
2. Create the free MongoDB Atlas database and a database user with read/write
   access to the `oathkeeper` database. Obtain its connection string with
   `/oathkeeper` before any query parameters.
3. In Render, create a Blueprint from this repository and select the branch
   containing these changes. Confirm the service plan says Free. Supply the
   database connection string as `MONGODB_URI` when prompted.
4. Add the Render service's outbound IP ranges to Atlas's network access list.
   Use the Render dashboard's connection information to find these ranges.
   The application cannot start until Atlas allows its connection.
5. Deploy and open the assigned Render website address. Check that `/api/health`
   returns `{"status":"ok"}`. If the first deployment failed while configuring
   database access, deploy again after fixing the access list.

This publishes the worksheet and database-backed community features. Uploads
remain disabled without durable file storage. Do not set UPLOAD_DIR to Render
Free temporary storage: files would be lost on restart. The current local file
adapter needs a durable replacement before Render uploads can be enabled.

For now:

1. Create accounts at [Render](https://dashboard.render.com/),
   [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register), and
   [Cloudflare](https://dash.cloudflare.com/). Do not purchase upgrades yet.
2. Tell the coding assistant when the accounts are ready. Do not paste passwords
   or secret keys into chat. Service setup and secret configuration come next,
   with guidance for the provider dashboards.
3. R2 activation requires a subscription checkout, even though it includes free
   usage. Review billing before enabling it. Account creation alone is enough
   for now. [R2 setup](https://developers.cloudflare.com/r2/get-started/).
4. After durable file storage is connected and deployment is tested, try the
   community with another person before a public launch.

Accounts, access checks, posts, group messaging, local uploads, and integration
tests are implemented. Cloud storage integration and password recovery remain.
No services have been created, purchases made, or deployments performed.
See [local community testing](community.md) to try the implemented feature now.
