import { Document, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { PDF_COLORS as C } from "./colors";
import type { ReportPdfView } from "./view";
import { BRAND_MARK, BRAND_NAME } from "@/lib/brand";

// La hoja del "Reporte (PDF)": tamaño carta, en el modo claro de la app. Página 1: el resumen, el gráfico
// y la tabla mes a mes; página 2: las categorías a la izquierda, y los gastos más grandes y los días de
// más gasto a la derecha. Los textos llegan armados (src/modules/reports/pdf/view.ts).
// La fuente es la de la app (Geist), registrada en render.tsx.

export const FONT = "Geist";

const TONES = { income: C.income, expense: C.expense, default: C.foreground } as const;

/** El alto del gráfico (sin los meses de abajo), en puntos. */
const CHART_HEIGHT = 120;
/** El margen de los lados y el ancho del contenido: el de la hoja carta (612 pt) sin los márgenes. */
const MARGIN = 40;
const CONTENT_WIDTH = 612 - 2 * MARGIN;
/** El espacio entre las tarjetas. */
const GAP = 8;

const s = StyleSheet.create({
  // Sin lineHeight en la hoja: heredado, deja los textos grandes encimados y el pie (fixed) sin dibujar.
  page: { fontFamily: FONT, fontSize: 8.5, color: C.foreground, paddingTop: 36, paddingBottom: 52, paddingHorizontal: MARGIN },
  muted: { color: C.muted },
  strong: { fontWeight: 600 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: C.brand },
  brandName: { fontSize: 9, fontWeight: 600, color: C.brand },
  title: { fontSize: 14, fontWeight: 600 },
  section: { marginTop: 16 },
  h2: { fontSize: 10.5, fontWeight: 600, marginBottom: 2 },
  intro: { color: C.muted, marginBottom: 4 },
  stats: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  stat: { borderWidth: 0.75, borderColor: C.border, borderRadius: 5, paddingVertical: 7, paddingHorizontal: 9, marginBottom: GAP },
  statValue: { fontSize: 12, fontWeight: 600, marginTop: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 4, borderBottomWidth: 0.75, borderBottomColor: C.border },
  cell: { width: 110, textAlign: "right" },
  track: { height: 4, borderRadius: 2, backgroundColor: C.background, marginTop: 3 },
  bar: { height: 4, borderRadius: 2 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: MARGIN,
    right: MARGIN,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 0.75,
    borderTopColor: C.border,
    color: C.muted,
  },
});

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      {/* El título no queda solo al final de una hoja. */}
      <Text style={s.h2} minPresenceAhead={40}>
        {title}
      </Text>
      {intro && <Text style={s.intro}>{intro}</Text>}
      {children}
    </View>
  );
}

const Empty = ({ text }: { text: string }) => <Text style={[s.muted, { paddingVertical: 10 }]}>{text}</Text>;

/** El logo de la app, el mismo dibujo de la web y de los íconos (src/lib/brand-mark.json), en el modo claro. */
function LogoMark({ size }: { size: number }) {
  return (
    <Svg viewBox={BRAND_MARK.viewBox} style={{ width: size, height: size }}>
      <Rect x={0} y={0} width={32} height={32} rx={BRAND_MARK.radius} fill={BRAND_MARK.brand} />
      <Path d={BRAND_MARK.bubble} fill={BRAND_MARK.brandForeground} />
      <Path
        d={BRAND_MARK.check}
        fill="none"
        stroke={BRAND_MARK.brand}
        strokeWidth={BRAND_MARK.checkWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Header({ view }: { view: ReportPdfView }) {
  return (
    <View style={s.header}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <LogoMark size={30} />
        <View style={{ marginLeft: 8 }}>
          <Text style={s.brandName}>{BRAND_NAME}</Text>
          <Text style={s.title}>{view.labels.title}</Text>
          <Text style={s.muted}>{view.range}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 200 }}>
        <Text style={s.muted}>{view.name}</Text>
        <Text style={s.muted}>{view.generated}</Text>
      </View>
    </View>
  );
}

function Stats({ view }: { view: ReportPdfView }) {
  // Tres arriba y dos abajo (el mes de más gasto, a lo ancho de dos), como en un computador.
  const third = (CONTENT_WIDTH - 2 * GAP) / 3;
  const widths = [third, third, third, third, 2 * third + GAP];
  return (
    <View style={s.stats}>
      {view.stats.map((stat, i) => (
        <View key={stat.label} style={[s.stat, { width: widths[i], marginRight: i === 2 || i === 4 ? 0 : GAP }]} wrap={false}>
          <Text style={s.muted}>{stat.label}</Text>
          <Text style={[s.statValue, { color: TONES[stat.tone] }]}>{stat.value}</Text>
          {stat.note && <Text style={s.muted}>{stat.note}</Text>}
        </View>
      ))}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color, marginRight: 4 }} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

/** Dos barras por mes (ingresos en verde y egresos en naranja) sobre las marcas del eje. */
function Chart({ chart, labels }: { chart: ReportPdfView["chart"]; labels: ReportPdfView["labels"] }) {
  const height = (amount: number) => (amount > 0 ? Math.max((amount / chart.max) * CHART_HEIGHT, 1) : 0);
  return (
    <View wrap={false}>
      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        <Legend color={C.income} label={labels.income} />
        <Legend color={C.expense} label={labels.expenses} />
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 44, height: CHART_HEIGHT, position: "relative" }}>
          {chart.ticks.map((tick) => (
            <Text key={tick.value} style={[s.muted, { position: "absolute", right: 6, top: CHART_HEIGHT - (tick.value / chart.max) * CHART_HEIGHT - 5, fontSize: 7.5 }]}>
              {tick.label}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ height: CHART_HEIGHT, position: "relative" }}>
            {chart.ticks.map((tick) => (
              <View
                key={tick.value}
                style={{ position: "absolute", left: 0, right: 0, top: CHART_HEIGHT - (tick.value / chart.max) * CHART_HEIGHT, borderTopWidth: 0.5, borderTopColor: C.border }}
              />
            ))}
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, flexDirection: "row", alignItems: "flex-end" }}>
              {chart.bars.map((bar, i) => (
                <View key={i} style={{ flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "flex-end" }}>
                  <View style={{ width: 9, height: height(bar.income), backgroundColor: C.income, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5, marginRight: 1.5 }} />
                  <View style={{ width: 9, height: height(bar.expense), backgroundColor: C.expense, borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5 }} />
                </View>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: "row", marginTop: 3 }}>
            {chart.bars.map((bar, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Text style={[s.muted, { fontSize: 7.5 }]}>{bar.short}</Text>
                {bar.year && <Text style={[s.muted, { fontSize: 7.5 }]}>{bar.year}</Text>}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function MonthTable({ months, labels }: { months: ReportPdfView["months"]; labels: ReportPdfView["labels"] }) {
  return (
    <View>
      <View style={[s.row, s.muted]} wrap={false}>
        <Text style={{ flex: 1 }}>{labels.month}</Text>
        <Text style={s.cell}>{labels.income}</Text>
        <Text style={s.cell}>{labels.expenses}</Text>
        <Text style={s.cell}>{labels.balance}</Text>
      </View>
      {months.map((month) => (
        <View key={month.label} style={s.row} wrap={false}>
          <Text style={{ flex: 1 }}>
            {month.label}
            {month.inProgress && <Text style={s.muted}>{labels.inProgress}</Text>}
          </Text>
          <Text style={[s.cell, { color: C.income }]}>{month.income}</Text>
          <Text style={[s.cell, { color: C.expense }]}>{month.expense}</Text>
          <Text style={[s.cell, { color: month.negative ? C.expense : C.foreground }]}>{month.balance}</Text>
        </View>
      ))}
    </View>
  );
}

/** Una fila con su texto (y una línea de detalle debajo) a la izquierda y un monto a la derecha. */
function Line({ title, detail, amount, tone = C.foreground }: { title: string; detail?: string; amount: string; tone?: string }) {
  return (
    <View style={s.row} wrap={false}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text>{title}</Text>
        {detail && <Text style={s.muted}>{detail}</Text>}
      </View>
      <Text style={{ color: tone, fontWeight: 600 }}>{amount}</Text>
    </View>
  );
}

function Categories({ categories, labels }: { categories: ReportPdfView["categories"]; labels: ReportPdfView["labels"] }) {
  return (
    <Section title={labels.categories} intro={categories.intro}>
      {categories.empty ? (
        <Empty text={categories.empty} />
      ) : (
        categories.rows.map((row) => (
          <View key={row.name} style={s.row} wrap={false}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: row.color, marginRight: 5 }} />
                  <Text>{row.name}</Text>
                </View>
                <Text>
                  {row.amount}
                  <Text style={s.muted}> · {row.share}</Text>
                </Text>
              </View>
              <View style={s.track}>
                <View style={[s.bar, { width: `${Math.max(row.width * 100, 1)}%`, backgroundColor: row.color }]} />
              </View>
              {row.change && <Text style={[s.muted, { marginTop: 2 }]}>{row.change}</Text>}
            </View>
          </View>
        ))
      )}
    </Section>
  );
}

function Biggest({ biggest, labels }: { biggest: ReportPdfView["biggest"]; labels: ReportPdfView["labels"] }) {
  return (
    <Section title={labels.biggest} intro={labels.biggestIntro}>
      {biggest.empty ? (
        <Empty text={biggest.empty} />
      ) : (
        biggest.rows.map((row, i) => <Line key={i} title={row.description} detail={row.detail} amount={row.amount} tone={C.expense} />)
      )}
    </Section>
  );
}

function Daily({ daily, labels }: { daily: ReportPdfView["daily"]; labels: ReportPdfView["labels"] }) {
  return (
    <Section title={labels.daily} intro={labels.dailyIntro}>
      {daily.empty ? (
        <Empty text={daily.empty} />
      ) : (
        <View wrap={false}>
          {daily.weekdays.map((day) => (
            <View key={day.label} style={{ flexDirection: "row", alignItems: "center", marginVertical: 2 }}>
              <Text style={[s.muted, { width: 50 }]}>{day.label}</Text>
              <View style={[s.track, { flex: 1, marginTop: 0, height: 6 }]}>
                <View style={[s.bar, { height: 6, width: `${day.width * 100}%`, backgroundColor: C.brand }]} />
              </View>
              <Text style={{ width: 82, textAlign: "right" }}>{day.amount}</Text>
            </View>
          ))}
          {daily.insight && <Text style={[s.muted, { marginTop: 4 }]}>{daily.insight}</Text>}
          <View style={{ flexDirection: "row", marginTop: 8, marginHorizontal: -3 }}>
            {daily.halves.map((half) => (
              <View key={half.label} style={[s.stat, { flex: 1, marginHorizontal: 3 }]}>
                <Text style={s.muted}>{half.label}</Text>
                <Text style={[s.strong, { fontSize: 10 }]}>{half.amount}</Text>
                <Text style={s.muted}>{half.share}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Section>
  );
}

export function ReportDocument({ view }: { view: ReportPdfView }) {
  return (
    <Document title={`${view.labels.title} · ${view.range}`} author={view.name} creator={BRAND_NAME} producer={BRAND_NAME} language={view.labels.language}>
      <Page size="LETTER" style={s.page}>
        <Header view={view} />
        {view.empty ? (
          <Empty text={view.empty} />
        ) : (
          <>
            <Stats view={view} />
            <Section title={view.labels.byMonth}>
              <Chart chart={view.chart} labels={view.labels} />
            </Section>
            <Section title={view.labels.monthByMonth}>
              <MonthTable months={view.months} labels={view.labels} />
            </Section>

            <View break style={[s.row, s.muted, { paddingTop: 0, paddingBottom: 8 }]}>
              <Text>
                {view.labels.title} · {view.range}
              </Text>
              <Text>{view.name}</Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: 11 }}>
                <Categories categories={view.categories} labels={view.labels} />
              </View>
              <View style={{ flex: 1, marginLeft: 11 }}>
                <Biggest biggest={view.biggest} labels={view.labels} />
                <Daily daily={view.daily} labels={view.labels} />
              </View>
            </View>
          </>
        )}
        {/* El pie, en cada hoja. */}
        <View style={s.footer} fixed>
          <Text>
            {BRAND_NAME} · {view.currency}
          </Text>
          <Text render={({ pageNumber, totalPages }) => view.labels.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
