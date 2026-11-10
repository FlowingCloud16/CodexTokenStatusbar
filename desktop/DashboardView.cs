using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace CodexTokenStatusbar {
    internal static class ViewTheme {
        private static readonly Dictionary<string, Font> fonts = new Dictionary<string, Font>();
        internal static Font Font(float size, bool bold = false) {
            string family = Localizer.Language == "zh" ? "Microsoft YaHei UI" : "Segoe UI";
            string key = family + ":" + size.ToString(CultureInfo.InvariantCulture) + ":" + bold;
            Font value; if (!fonts.TryGetValue(key, out value)) { value = new Font(family, size, bold ? FontStyle.Bold : FontStyle.Regular); fonts.Add(key, value); }
            return value;
        }
        internal static Color Surface = Color.FromArgb(39, 39, 39), Foreground = Color.FromArgb(237, 237, 237), Muted = Color.FromArgb(165, 165, 165),
            Hover = Color.FromArgb(55, 55, 55), Selection = Color.FromArgb(66, 66, 66), Line = Color.FromArgb(70, 70, 70);
        internal static void Set(bool dark) {
            Surface = dark ? Color.FromArgb(39, 39, 39) : Color.FromArgb(250, 250, 250);
            Foreground = dark ? Color.FromArgb(237, 237, 237) : Color.FromArgb(32, 32, 32);
            Muted = dark ? Color.FromArgb(165, 165, 165) : Color.FromArgb(100, 100, 100);
            Hover = dark ? Color.FromArgb(55, 55, 55) : Color.FromArgb(239, 239, 239);
            Selection = dark ? Color.FromArgb(66, 66, 66) : Color.FromArgb(228, 228, 228);
            Line = dark ? Color.FromArgb(70, 70, 70) : Color.FromArgb(220, 220, 220);
        }
        internal static GraphicsPath Round(Rectangle bounds, int radius) {
            int d = Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height));
            var path = new GraphicsPath();
            path.AddArc(bounds.Left, bounds.Top, d, d, 180, 90); path.AddArc(bounds.Right - d, bounds.Top, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90); path.AddArc(bounds.Left, bounds.Bottom - d, d, d, 90, 90); path.CloseFigure();
            return path;
        }
    }
    internal sealed class NativeLabel : Label {
        internal NativeLabel() { UseCompatibleTextRendering = true; }
    }
    internal class NativeButton : Button {
        internal bool Primary;
        private bool hover, pressed;
        internal NativeButton() {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            FlatStyle = FlatStyle.Flat; FlatAppearance.BorderSize = 0; Cursor = Cursors.Hand;
        }
        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = pressed = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { pressed = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(ViewTheme.Surface); e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            Color fill = Primary ? (pressed ? Color.FromArgb(202, 202, 202) : hover ? Color.White : Color.FromArgb(235, 235, 235))
                : pressed || hover ? ViewTheme.Selection : ViewTheme.Hover;
            using (var shape = ViewTheme.Round(new Rectangle(0, 0, Width - 1, Height - 1), 7))
            using (var brush = new SolidBrush(fill)) e.Graphics.FillPath(brush, shape);
            Color foreground = Enabled ? Primary ? Color.FromArgb(28, 28, 28) : ViewTheme.Foreground : ViewTheme.Muted;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
            using (var brush = new SolidBrush(foreground)) using (var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter })
                e.Graphics.DrawString(Text, Font, brush, ClientRectangle, format);
            if (Focused && ShowFocusCues) ControlPaint.DrawFocusRectangle(e.Graphics, new Rectangle(4, 4, Width - 9, Height - 9), foreground, fill);
        }
    }
    internal sealed class StatusLamp : Control {
        internal bool Connected, Error;
        internal StatusLamp() { SetStyle(ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true); TabStop = false; }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(ViewTheme.Surface); e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var brush = new SolidBrush(Connected ? Color.FromArgb(76, 194, 85) : Error ? Color.FromArgb(224, 160, 66) : ViewTheme.Muted))
                e.Graphics.FillEllipse(brush, 2, Height / 2 - 6, 12, 12);
        }
    }
    internal sealed partial class Dashboard {
        private readonly Panel overview = new Panel();
        private readonly Label[] metricLabels = { new NativeLabel(), new NativeLabel(), new NativeLabel(), new NativeLabel() }, metricValues = { new NativeLabel(), new NativeLabel(), new NativeLabel(), new NativeLabel() };
        private readonly PictureBox[] metricIcons = { new PictureBox(), new PictureBox(), new PictureBox(), new PictureBox() };
        private readonly StatusLamp lamp = new StatusLamp();
        private readonly ToolTip tips = new ToolTip();
        private Dictionary<string, object> desktopData;
        private string theme = "dark";
        [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
        private float UiScale { get { using (var graphics = CreateGraphics()) return Font.SizeInPoints / 10.5f * graphics.DpiX / 96f; } }
        private static Label StyleLabel(Label label, float size, bool bold = false, bool muted = false) {
            label.AutoSize = false; label.Font = ViewTheme.Font(size, bold);
            label.ForeColor = muted ? ViewTheme.Muted : ViewTheme.Foreground; label.BackColor = ViewTheme.Surface;
            return label;
        }
        private void InitializeView() {
            SuspendLayout(); DoubleBuffered = true; AutoScaleDimensions = new SizeF(96, 96); AutoScaleMode = AutoScaleMode.Dpi;
            Text = "Codex Statusbar"; Font = new Font("Segoe UI", 10.5f);
            Icon = Icon.ExtractAssociatedIcon(GetType().Assembly.Location) ?? SystemIcons.Application;
            ClientSize = new Size(720, 324); MinimumSize = Size; FormBorderStyle = FormBorderStyle.Sizable;
            StartPosition = FormStartPosition.CenterScreen;
            StyleLabel(title, 14, true); StyleLabel(connection, 9, false, true);
            StyleLabel(heading, 16, true); StyleLabel(detail, 10, false, true);
            overview.Controls.AddRange(new Control[] { lamp, heading, detail });
            string[] resources = { "speed", "cache", "total", "cost" };
            for (int i = 0; i < 4; i++) {
                StyleLabel(metricLabels[i], 10, false, true); StyleLabel(metricValues[i], 22, true);
                metricValues[i].AutoEllipsis = true; metricIcons[i].SizeMode = PictureBoxSizeMode.Zoom; metricIcons[i].Tag = resources[i];
                overview.Controls.AddRange(new Control[] { metricIcons[i], metricLabels[i], metricValues[i] });
            }
            reconnect.Font = stop.Font = new Font("Segoe UI", 10);
            reconnect.TabIndex = 0; stop.TabIndex = 1; load.TabIndex = 2;
            reconnect.Click += async (s, e) => await LoadAsync(false);
            stop.Click += async (s, e) => await StopAsync();
            ((NativeButton)load).Primary = true; load.Font = new Font("Segoe UI", 10.5f, FontStyle.Bold);
            load.Click += async (s, e) => { if (headingSource == "Status bar loaded") await FocusCodexAsync(); else await LoadAsync(restarting); };
            Controls.AddRange(new Control[] { title, overview, reconnect, stop, load });
            overview.Paint += (s, e) => PaintOverview(e.Graphics);
            ApplyTheme("dark"); ResumeLayout(); ArrangeView();
        }
        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); ApplyCaptionTheme(); }
        private void ApplyCaptionTheme() { try { int dark = theme == "dark" ? 1 : 0; DwmSetWindowAttribute(Handle, 20, ref dark, 4); } catch (DllNotFoundException) { } }
        private void ApplyTheme(string next) {
            theme = next == "light" ? "light" : "dark"; ViewTheme.Set(theme == "dark");
            ApplyControlTheme(this); ApplyCaptionTheme();
            foreach (var picture in metricIcons) {
                var old = picture.Image;
                using (var stream = GetType().Assembly.GetManifestResourceStream("statusbar.icon." + picture.Tag))
                using (var original = Image.FromStream(stream)) {
                    var bitmap = new Bitmap(48, 48);
                    using (var graphics = Graphics.FromImage(bitmap)) using (var attributes = new ImageAttributes()) {
                        var matrix = new ColorMatrix(); matrix.Matrix00 = ViewTheme.Foreground.R / 255f; matrix.Matrix11 = ViewTheme.Foreground.G / 255f; matrix.Matrix22 = ViewTheme.Foreground.B / 255f;
                        attributes.SetColorMatrix(matrix); graphics.DrawImage(original, new Rectangle(0, 0, 48, 48), 0, 0, 48, 48, GraphicsUnit.Pixel, attributes);
                    }
                    picture.Image = bitmap;
                }
                if (old != null) old.Dispose();
            }
            Invalidate(true);
        }
        private static void ApplyControlTheme(Control parent) {
            parent.BackColor = ViewTheme.Surface; parent.ForeColor = ViewTheme.Foreground;
            foreach (Control child in parent.Controls) { ApplyControlTheme(child); if (child is Label && !child.Font.Bold) child.ForeColor = ViewTheme.Muted; }
        }
        private void ArrangeView() {
            if (overview == null || !IsHandleCreated) return;
            float s = UiScale; int width = ClientSize.Width, height = ClientSize.Height;
            Action<Control, float, float, float, float> place = (control, x, y, boxWidth, boxHeight) => control.SetBounds((int)(x * s), (int)(y * s), (int)(boxWidth * s), (int)(boxHeight * s));
            float w = width / s, h = height / s;
            place(title, 24, 10, w - 48, 36);
            place(overview, 24, 64, w - 48, h - 144);
            place(lamp, 0, 7, 20, 28); place(heading, 28, 5, w - 84, 36); place(detail, 0, 47, w - 48, 46);
            float column = (w - 48) / 4;
            for (int i = 0; i < 4; i++) {
                float x = i * column + (i == 0 ? 0 : 16);
                place(metricIcons[i], x, 97, 19, 19); place(metricLabels[i], x + 27, 95, column - 32, 24);
                place(metricValues[i], x, 122, column - 16, 48);
            }
            place(reconnect, 24, h - 60, 132, 40); place(stop, 168, h - 60, 156, 40);
            place(load, w - 186, h - 60, 162, 40);
            FitMetricValues(); Invalidate();
        }
        protected override void OnLayout(LayoutEventArgs e) { base.OnLayout(e); ArrangeView(); }
        protected override void OnPaint(PaintEventArgs e) {
            base.OnPaint(e); float s = UiScale;
            using (var pen = new Pen(ViewTheme.Line)) {
                e.Graphics.DrawLine(pen, 24 * s, 52 * s, ClientSize.Width - 24 * s, 52 * s);
                e.Graphics.DrawLine(pen, 24 * s, ClientSize.Height - 80 * s, ClientSize.Width - 24 * s, ClientSize.Height - 80 * s);
            }
        }
        private void PaintOverview(Graphics graphics) {
            float s = UiScale;
            using (var pen = new Pen(ViewTheme.Line))
                for (int i = 1; i < 4; i++) graphics.DrawLine(pen, i * overview.Width / 4, 95 * s, i * overview.Width / 4, 165 * s);
        }
        private void RefreshViewLanguage() {
            ApplyFontLanguage(this);
            title.Text = Localizer.Text("Codex Statusbar");
            reconnect.Text = Localizer.Text("Reconnect"); stop.Text = Localizer.Text("Unload status bar");
            string[] metrics = { "Speed", "Cache hit", "Token usage", "API estimate" };
            for (int i = 0; i < 4; i++) metricLabels[i].Text = Localizer.Text(metrics[i]);
            Invalidate(true);
        }
        private static void ApplyFontLanguage(Control parent) {
            parent.Font = ViewTheme.Font(parent.Font.SizeInPoints, parent.Font.Bold);
            foreach (Control control in parent.Controls) ApplyFontLanguage(control);
        }
        private void UpdateViewState() {
            lamp.Connected = headingSource == "Status bar loaded"; lamp.Error = detailIsError || headingSource == "Codex version changed"; lamp.Invalidate();
            load.Text = Localizer.Text(lamp.Connected ? "Open Codex" : restarting ? "Restart Codex & load" : "Load status bar");
            if (!lamp.Connected) { desktopData = null; UpdateMetrics(); }
        }
        private static Dictionary<string, object> ObjectValue(Dictionary<string, object> source, string key) {
            object result; return source != null && source.TryGetValue(key, out result) ? result as Dictionary<string, object> : null;
        }
        private void UpdateMetrics() {
            var values = ObjectValue(desktopData, "values"); string[] keys = { "speed", "cache", "total", "cost" };
            for (int i = 0; i < 4; i++) {
                metricValues[i].Text = values == null ? "--" : Program.Value(values, keys[i]);
                metricValues[i].AccessibleName = metricLabels[i].Text + ": " + metricValues[i].Text;
                tips.SetToolTip(metricValues[i], i == 0 && desktopData != null ? Program.Value(desktopData, "speedNote") : metricValues[i].Text);
            }
            FitMetricValues();
        }
        private void FitMetricValues() {
            using (var graphics = CreateGraphics()) foreach (var label in metricValues) {
                string raw = label.Text.Replace("\n", "").Replace("– ", "–");
                bool wrap = raw.Contains("–") && graphics.MeasureString(raw, ViewTheme.Font(11, true)).Width > label.Width - 3;
                label.Text = wrap ? raw.Replace("–", "\n– ") : raw;
                float size = wrap ? 14 : 22;
                while (size > 11) {
                    var measured = graphics.MeasureString(label.Text, ViewTheme.Font(size, true));
                    if (measured.Width <= label.Width - 3 && measured.Height <= label.Height - 2) break;
                    size -= .5f;
                }
                label.Font = ViewTheme.Font(size, true);
            }
        }
        private async System.Threading.Tasks.Task FocusCodexAsync() {
            if (busy) return; SetBusy(true);
            try {
                var current = await System.Threading.Tasks.Task.Run(() => Client.Find());
                var process = current == null ? null : current.NormalProcesses.FirstOrDefault();
                if (process != null) using (var running = System.Diagnostics.Process.GetProcessById(process.Id)) {
                    running.Refresh(); var window = running.MainWindowHandle;
                    if (window != IntPtr.Zero) { Native.ShowWindowAsync(window, 9); Native.SetForegroundWindow(window); return; }
                }
                SetState("Waiting for Codex", "If Codex was opened from its original shortcut, use Load to reconnect. A restart may be needed.");
            } catch (Exception ex) { Program.LogError(ex); SetState("Could not load", ex.Message, true); }
            finally { SetBusy(false); }
        }
        protected override void Dispose(bool disposing) {
            if (disposing) { tips.Dispose(); foreach (var icon in metricIcons) if (icon.Image != null) icon.Image.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
