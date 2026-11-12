import { Link, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { brand } from '../brand';
import { useI18n } from '../i18n/I18nProvider';
import { fillLegal, type Inline, legalValues, parseLegal } from '../lib/legal';
import { clubUrl, SUPPORT_EMAIL } from '../lib/program';
import { useSession } from '../lib/session';
import { type } from '../theme/fonts';
import { colors, space } from '../theme/tokens';
import { Card, Muted } from './ui';

function Parts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.kind === 'bold') {
          return (
            <Text key={i} style={type.bodyStrong}>
              {part.text}
            </Text>
          );
        }
        if (part.kind === 'link') {
          return (
            <Link key={i} href={part.href as Href} style={styles.link}>
              {part.text}
            </Link>
          );
        }
        return <Text key={i}>{part.text}</Text>;
      })}
    </>
  );
}

/**
 * A legal text from src/legal (privacy policy, terms) in the member's
 * language, with the brand's details and today's program numbers.
 */
export function LegalDocument({ template }: { template: { el: string; en: string } }) {
  const { t, locale } = useI18n();
  const { config } = useSession();
  const values = legalValues({ brand, config, locale, t, siteHost: clubUrl(), supportEmail: SUPPORT_EMAIL });
  const blocks = parseLegal(fillLegal(template[locale], values));

  return (
    <View style={styles.doc}>
      {brand.legal.company ? null : (
        <Card style={styles.draft}>
          <Muted>{t('legal.draft')}</Muted>
        </Card>
      )}
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <Text key={i} accessibilityRole="header" style={[type.label, styles.heading]}>
              {block.text}
            </Text>
          );
        }
        if (block.kind === 'bullets') {
          return (
            <View key={i} style={styles.list}>
              {block.items.map((item, j) => (
                <View key={j} style={styles.bullet}>
                  <Text style={type.body}>•</Text>
                  <Text style={[type.body, styles.bulletText]}>
                    <Parts parts={item} />
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={type.body}>
            <Parts parts={block.parts} />
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  doc: { gap: space.ms },
  draft: { backgroundColor: colors.surface },
  heading: { fontSize: 17, lineHeight: 24, marginTop: space.sm },
  list: { gap: space.xs },
  bullet: { flexDirection: 'row', gap: space.sm, paddingRight: space.sm },
  bulletText: { flex: 1 },
  link: { color: colors.accent, textDecorationLine: 'underline' },
});
