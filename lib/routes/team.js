import { clerkClient } from '@clerk/express';
// Workspace roster: who can sign in, and at what role.
//
// Extracted from server.js, which had grown past 1,500 lines of routing,
// auth, rendering, uploads and CSP in one file. Behaviour is unchanged: the
// handlers below are the same code, moved. Shared helpers arrive through
// `ctx` rather than closing over module scope, which is what makes the move
// possible without threading globals — the same pattern lib/collectionsRoutes.js
// already used.

export function registerTeamRoutes(app, ctx) {
  const { storage, requireOrg, requireRole, auditFor } = ctx;


  app.get('/api/team', requireOrg, async (req, res, next) => {
    try { res.json(await storage.team.list(req.org.id)); } catch (e) { next(e); }
  });

  app.post('/api/team', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const { name, email, role } = req.body;
      if (!name?.trim() || !email?.trim() || !['viewer', 'editor', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'name, email, and a valid role are required' });
      }
      const cleanEmail = email.trim().toLowerCase();
      const entry = await storage.team.add(req.org.id, {
        id: 'team-' + Date.now(), name: name.trim(), email: cleanEmail, role,
      });
      // Real membership row (what resolveViewer actually checks) + a real
      // Clerk invitation email. Previously this route only wrote the roster
      // row while the UI implied an invite email had been sent -- the invite
      // was actually a manual Clerk-dashboard step.
      await storage.orgMembers.add(req.org.id, cleanEmail, role).catch(() => {});
      let invited = false;
      let inviteError = null;
      try {
        await clerkClient.invitations.createInvitation({
          emailAddress: cleanEmail,
          redirectUrl: `https://${req.headers.host}/${req.org.id}`,
          notify: true,
          ignoreExisting: true,
        });
        invited = true;
      } catch (e) {
        // Surface WHY instead of swallowing it: most often the address already
        // has a Clerk account (no invite email needed -- they can just sign in),
        // an existing pending invite (Clerk won't re-send), or the redirect URL
        // isn't allowlisted in Clerk. The membership row above still lets them
        // in once they sign in with this email.
        inviteError = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.message || 'Invitation could not be sent.';
        console.error('[team invite]', cleanEmail, inviteError);
      }
      await auditFor(req.org.id, req.viewer)('Added team member', `${entry.name} <${entry.email}> as ${entry.role}${invited ? '' : ' (invite email not sent)'}`);
      res.json({ success: true, entry, invited, inviteError });
    } catch (e) { next(e); }
  });

  app.delete('/api/team/:id', requireOrg, requireRole('admin'), async (req, res, next) => {
    try {
      const removed = await storage.team.remove(req.org.id, req.params.id);
      if (!removed) return res.status(404).json({ error: 'Team member not found' });
      await auditFor(req.org.id, req.viewer)('Removed team member', `${removed.name} <${removed.email}>`);
      res.json({ success: true });
    } catch (e) { next(e); }
  });

}
